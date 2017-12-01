/*jshint esversion: 6 */
const https = require('https');
const express = require("express");
const bodyParser = require("body-parser");
const fs = require('fs');

const databox = require('node-databox');

var twitter = require('./twitter.js')();

let DefaultTwitConfig = {};
try {
  DefaultTwitConfig = require('./twitter-secret.json');
} catch (e) {
  DefaultTwitConfig = {};
}

const DATABOX_ZMQ_ENDPOINT = process.env.DATABOX_ZMQ_ENDPOINT

const credentials = databox.getHttpsCredentials();

var PORT = process.env.port || '8080';

var HASH_TAGS_TO_TRACK = ['#raspberrypi', '#mozfest', '#databox', '#iot', '#NobelPrize'];
var TWITER_USER = 'databox_mozfest';

var app = express();

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/ui', express.static('./src/www'));
app.set('views', './src/views');
app.set('view engine', 'pug');

app.get('/ui', function(req, res) {
  getSettings()
    .then((settings)=>{
      settings.hashTags = settings.hashTags.join(',');
      console.log("[/ui render]");
      res.render('index', settings);
    })
    .catch((error)=>{
      console.log("[/ui] Error ",error);
    });
});

app.get('/ui/setCreds', function(req, res) {

  getSettings()
    .then((settings)=>{
      console.log("/ui/setCreds - setting == ", settings, res.query);
      settings.consumer_key = req.param('consumer_key');
      settings.consumer_secret = req.param('consumer_secret');
      settings.access_token = req.param('access_token');
      settings.access_token_secret = req.param('access_token_secret');
      console.log("[NEW SETTINGS]",settings);
      return setSettings(settings);
    })
    .then((settings)=>{
      return Promise.all([twitter.connect(settings),Promise.resolve(settings)]);
    })
    .then((data)=>{
      let T = data[0];
      let settings = data[1];
      stopAllStreams();
      monitorTwitterEvents(T,settings);
      res.status(200).send({statusCode:200, body:"ok"});
    })
    .catch((error)=>{
      console.log("[setCreds] Error ",error);
      res.status(400).send({statusCode:400, body:"error setting setCreds"});
    });
});

app.get('/ui/setHashTags', function(req, res) {
    let newHashTags  = req.query.hashTags;
    console.log(newHashTags);
    getSettings()
    .then((settings)=>{
      settings.hashTags = newHashTags.split(',');
      console.log("[SETTINGS]",settings);
      return setSettings(settings);
    })
    .then((settings)=>{
      return Promise.all([twitter.connect(settings),Promise.resolve(settings)]);
    })
    .then((data)=>{
      let T = data[0];
      let settings = data[1];
      stopAllStreams();
      monitorTwitterEvents(T,settings);
      res.status(200).send({statusCode:200, body:"ok"});
    })
    .catch((error)=>{
      console.log("[setHashTags] Error ",error);
      res.status(400).send({statusCode:400, body:"error setting hashtags"});
    });

});

app.get("/status", function(req, res) {
    res.send("active");
});

console.log("[Creating server]");
https.createServer(credentials, app).listen(PORT);
module.exports = app;


var T = null;

var vendor = "databox";

let tsc = databox.NewTimeSeriesClient(DATABOX_ZMQ_ENDPOINT, false);
let kvc = databox.NewKeyValueClient(DATABOX_ZMQ_ENDPOINT, false);

let timeLine = databox.NewDataSourceMetadata();
timeLine.Description =  'Twitter user timeline data';
timeLine.ContentType = 'application/json';
timeLine.Vendor = 'Databox Inc.';
timeLine.DataSourceType = 'twitterUserTimeLine';
timeLine.DataSourceID = 'twitterUserTimeLine';
timeLine.StoreType = 'ts';

let hashTag = databox.NewDataSourceMetadata();
hashTag.Description =  'Twitter user hashtag data';
hashTag.ContentType = 'application/json';
hashTag.Vendor = 'Databox Inc.';
hashTag.DataSourceType = 'twitterHashTagStream';
hashTag.DataSourceID = 'twitterHashTagStream';
hashTag.StoreType = 'ts';

let userDM = databox.NewDataSourceMetadata();
userDM.Description = 'Twitter users direct messages';
userDM.ContentType = 'application/json';
userDM.Vendor = 'Databox Inc.';
userDM.DataSourceType = 'twitterDirectMessage';
userDM.DataSourceID = 'twitterDirectMessage';
userDM.StoreType = 'ts';

let userRetweet = databox.NewDataSourceMetadata();
userRetweet.Description = 'Twitter users retweets';
userRetweet.ContentType = 'application/json';
userRetweet.Vendor = 'Databox Inc.';
userRetweet.DataSourceType = 'twitterRetweet';
userRetweet.DataSourceID = 'twitterRetweet';
userRetweet.StoreType = 'ts';

let userFav = databox.NewDataSourceMetadata();
userFav.Description = 'Twitter users favorite tweets';
userFav.ContentType = 'application/json';
userFav.Vendor = 'Databox Inc.';
userFav.DataSourceType = 'twitterFavorite';
userFav.DataSourceID = 'twitterFavorite';
userFav.StoreType = 'ts';

let testActuator = databox.NewDataSourceMetadata();
testActuator.Description = 'Test Actuator';
testActuator.ContentType = 'application/json';
testActuator.Vendor = 'Databox Inc.';
testActuator.DataSourceType = 'testActuator';
testActuator.DataSourceID = 'testActuator';
testActuator.StoreType = 'ts';
testActuator.IsActuator = true;

let driverSettings = databox.NewDataSourceMetadata();
driverSettings.Description = 'Twitter driver settings';
driverSettings.ContentType = 'application/json';
driverSettings.Vendor = 'Databox Inc.';
driverSettings.DataSourceType = 'twitterSettings';
driverSettings.DataSourceID = 'twitterSettings';
driverSettings.StoreType = 'kv';


tsc.RegisterDatasource(timeLine)
.then(() => {
  return tsc.RegisterDatasource(hashTag);
})
.then(() => {
  return tsc.RegisterDatasource(userDM);
})
.then(() => {
  return tsc.RegisterDatasource(userRetweet);
})
.then(() => {
  return tsc.RegisterDatasource(userFav);
})
.then(() => {
  return tsc.RegisterDatasource(testActuator);
})
.then(() => {
  return kvc.RegisterDatasource(driverSettings);
})
.catch((err) => {
  console.log("Error registering data source:" + err);
});

getSettings()
  .then((settings)=>{
    console.log("Twitter Auth");
    if(settings.hasOwnProperty('consumer_key')) {
      return Promise.all([twitter.connect(settings),Promise.resolve(settings)]);
    } else {
      return Promise.all([Promise.resolve(null),Promise.resolve(settings)]);
    }
  })
  .then((data)=>{
    console.log("Connected to twitter!");

    let T = data[0];
    let settings = data[1];

    //deal with the actuator
    let datasourceid = "testActuator";
    tsc.Observe(testActuator.DataSourceID, 0)
    .catch((err)=>{
      console.log("[Actuation observing error]",err);
    })
    .then((eventEmitter)=>{
      eventEmitter.on('data',(data)=>{
        console.log("[Actuation] data received ", data);
      });
    })
    .catch((err)=>{
      console.log("[Actuation error]",err);
    });

    if(T != null) {
      monitorTwitterEvents(T,settings);
    }

  })
  .catch((err) => {
    console.log("[ERROR]",err);
  });

var streams = [];
const monitorTwitterEvents = (twit,settings)=>{

    console.log("monitorTwitterEvents called");

      //deal with twitter events
    var HashtagStream = twit.stream('statuses/filter', { track: settings.hashTags , language:'en'});
    streams.push(HashtagStream);
    HashtagStream.on('tweet', function (tweet) {
      save('twitterHashTagStream', tweet);
    });

    var UserStream = twit.stream('user', { stringify_friend_ids: true, with: 'followings', replies:'all' });
    streams.push(UserStream);
    UserStream.on('tweet', function (event) {
      save('twitterUserTimeLine',event);
    });

    UserStream.on('favorite', function (event) {
      save('twitterFavorite',event);
    });

    UserStream.on('quoted_tweet', function (event) {
      save('twitterRetweet',event);
    });

    UserStream.on('retweeted_retweet', function (event) {
      save('twitterRetweet',event);
    });

    UserStream.on('direct_message', function (event) {
      save('twitterDirectMessage',event);
    });
};

function stopAllStreams () {
  streams.map((st)=>{st.stop();});
  streams = [];
}

function getSettings () {
  datasourceid = 'twitterSettings';
  return new Promise((resolve,reject)=>{
    kvc.Read(datasourceid)
    .then((settings)=>{
      if(Object.keys(settings).length == 0) {
         //return defaults
       let settings = DefaultTwitConfig;
       settings.hashTags = HASH_TAGS_TO_TRACK;
       console.log("[getSettings] using defaults Using ----> ", settings);
       resolve(settings);
       return
      }
      console.log("[getSettings]",settings);
      resolve(settings);
    })
    .catch((err)=>{
     let settings = DefaultTwitConfig;
     settings.hashTags = HASH_TAGS_TO_TRACK;
     console.log("[getSettings] using defaults Using ----> ", settings);
     resolve(settings);
     return
    });
  });
 };

function setSettings (settings) {
 let datasourceid = 'twitterSettings';
 return new Promise ((resolve,reject)=>{
  kvc.Write(datasourceid, settings)
    .then(()=>{
      console.log('[setSettings] settings saved', settings);
      resolve(settings);
    })
    .catch((err)=>{
      console.log("Error setting settings", err);
      reject(err);
    });
  });
};

function save (datasourceid,data) {
  console.log("Saving data::", typeof data, datasourceid, {"data": data});
  json = {"data": data};
  tsc.Write(datasourceid,data)
  .then((resp)=>{
    console.log("Save got response ", resp);
  })
  .catch((error)=>{
    console.log("Error writing to store:", error);
  });
}