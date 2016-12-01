/*jshint esversion: 6 */
var https = require('https');
var express = require("express");
var bodyParser = require("body-parser");
var session = require("express-session");

var databoxRequest = require('./lib/databox-request.js');

var twitter = require('./twitter.js');
var sensors = ['twitterUserTimeLine','twitterHashTagStream', 'twitterDirectMessage', 'twitterRetweet', 'twitterFavorite'];

var DATABOX_STORE_BLOB_ENDPOINT = process.env.DATABOX_DRIVER_TWITTER_STREAM_DATABOX_STORE_BLOB_ENDPOINT;

var HTTPS_CLIENT_CERT = process.env.HTTPS_CLIENT_CERT || '';
var HTTPS_CLIENT_PRIVATE_KEY = process.env.HTTPS_CLIENT_PRIVATE_KEY || '';
var credentials = {
	key:  HTTPS_CLIENT_PRIVATE_KEY,
	cert: HTTPS_CLIENT_CERT,
};

var HASH_TAGS_TO_TRACK = ['#raspberrypi', '#mozfest', '#databox', '#iot', '#NobelPrize'];
var TWITER_USER = 'databox_mozfest';

var SENSOR_TYPE_IDs = [];
var SENSOR_IDs = {};
var VENDOR_ID = null;
var DRIVER_ID = null;
var DATASTORE_ID = null;


var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    res.header('Content-Type', 'application/json');
    next();
};


var app = express();
app.use(session({resave: false, saveUninitialized: false,  secret: 'databox'}));
app.use(express.static('src/static'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(allowCrossDomain);

app.get("/status", function(req, res) {
    res.send("active");
});

app.get("/connect", twitter.connect);

app.get("/callback", twitter.auth);
app.get("/databox-driver-twitter-stream/callback", twitter.auth); //fake endpoint for debugging outside of databox

app.get("/is-signed-in", function(req, res) {
    res.end('' + twitter.isSignedIn());
});

var T = null;

var vendor = "databox";

var waitForDatastore = function () {
  return new Promise((resolve, reject)=>{
    var untilActive = function (error, response, body) {
      if(error) {
        console.log(error);
      } else if(response.statusCode != 200) {
        console.log("Error::", body);
      }
      if (body === 'active') {
        resolve();
      }
      else {
        setTimeout(() => {
          var options = {
              uri: DATABOX_STORE_BLOB_ENDPOINT + "/status",
              method: 'GET',
          };
          databoxRequest(options, untilActive);
        }, 1000);
        console.log("Waiting for datastore ....");
      }
    };
    untilActive({});
  });
};

var waitForTwitterAuth = function () {
  return new Promise((resolve, reject)=>{
    
    var waitForIt = function() {
      if(twitter.isSignedIn() === true) {
        resolve();
      } else {
        console.log("Waiting to twitter auth .....");
        setTimeout(waitForIt,2000);
      }

    };
    waitForIt();
  });
};

var register_sensor = function (vendor, sensor_id,sensor_type, unit, description, location ) {
  var options = {
        uri: DATABOX_STORE_BLOB_ENDPOINT+'/cat/add/'+sensor_id,
        method: 'POST',
        json: 
        {
          "vendor": vendor,
          "sensor_type": sensor_type,
          "unit": unit,
          "description": description,
          "location": location,
        },
    };

  return new Promise((resolve, reject) => {
    
    var register_sensor_callback = function (error, response, body) {
        if (error) {
          console.log(error);
          console.log("Can not register sensor with datastore! waiting 5s before retrying");
          setTimeout(databoxRequest, 5000, options, register_sensor_callback);
          return;
        }
        resolve(body);
    };
    console.log("Trying to register sensor with datastore.", options);
    databoxRequest(options,register_sensor_callback);
  
  });
};

waitForDatastore()
  .then(() =>{
    proms = [
      register_sensor(vendor, 'twitterUserTimeLine','twitterUserTimeLine', '', 'Twitter user timeline data', 'The Internet'),
      register_sensor(vendor, 'twitterHashTagStream','twitterHashTagStream', '', 'Twitter hashtag data', 'The Internet'),
      register_sensor(vendor, 'twitterDirectMessage','twitterDirectMessage', '', 'Twitter users direct messages', 'The Internet'),
      register_sensor(vendor, 'twitterRetweet','twitterRetweet', '', 'Twitter users retweets', 'The Internet'),
      register_sensor(vendor, 'twitterFavorite','twitterFavorite', '', 'Twitter users favorite tweets', 'The Internet')
    ];
    return Promise.all(proms);
  })
  .then(()=>{
    https.createServer(credentials, app).listen(8080);
    return waitForTwitterAuth();
  })
  .then(()=>{

    T = twitter.Twit();

    var HashtagStream = T.stream('statuses/filter', { track: HASH_TAGS_TO_TRACK , language:'en'});
    HashtagStream.on('tweet', function (tweet) {
      save('twitterHashTagStream', tweet);
    });

    var UserStream = T.stream('user', { stringify_friend_ids: true, with: 'followings', replies:'all' });
    
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
    
  })
  .catch((err) => {
    console.log(err);
  });

module.exports = app;

function save(sensor_id,data) {
      console.log("Saving data::", sensor_id, data.text);
      var options = {
          uri: DATABOX_STORE_BLOB_ENDPOINT + '/data',
          method: 'POST',
          json: 
          {
            'sensor_id': sensor_id, 
            'vendor_id': vendor, 
            'data': data   
          },
          agent:httpsAgent
      };
      databoxRequest(options, (error, response, body) => { if(error) console.log(error, body);});
    }