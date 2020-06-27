/*jshint esversion: 6 */
const https = require('https');
const express = require("express");
const bodyParser = require("body-parser");
const oauth = require('oauth');
const databox = require('node-databox');
const dns = require('dns');

const twitter = require('./twitter.js')();

let DefaultTwitConfig = {};
try {
	DefaultTwitConfig = require('./twitter-secret.json');
} catch (e) {
	DefaultTwitConfig = {};
}

const DATABOX_ARBITER_ENDPOINT = process.env.DATABOX_ARBITER_ENDPOINT || 'tcp://127.0.0.1:4444';
const DATABOX_ZMQ_ENDPOINT = process.env.DATABOX_ZMQ_ENDPOINT;

const credentials = databox.GetHttpsCredentials();

const PORT = process.env.port || '8080';

const HASH_TAGS_TO_TRACK = ['#raspberrypi', '#mozfest', '#databox', '#iot', '#NobelPrize'];

const app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.use('/ui', express.static('./src/www'));
app.set('views', './src/views');
app.set('view engine', 'pug');

app.get('/ui', function (req, res) {
	getSettings()
		.then((settings) => {
			console.log("[/ui render]");
			res.render('index', settings);
		})
		.catch((error) => {
			console.log("[/ui] Error ", error);
		});
});

let consumer;
app.post('/ui/login', (req, res) => {
	getSettings()
		.then((settings) => {
			let urlRoot = req.body.callback;
			console.log("[/ui/login] override callback = "+urlRoot);
			if (urlRoot == null) {
				urlRoot = "https://localhost/driver-twitter/ui/oauth"
			}
			if (req.body.consumer_key) {
				settings.consumer_key = req.body.consumer_key;
			}
			if (req.body.consumer_secret) {
				settings.consumer_secret = req.body.consumer_secret;
			}

			consumer = new oauth.OAuth(
				"https://api.twitter.com/oauth/request_token", "https://api.twitter.com/oauth/access_token",
				settings.consumer_key, settings.consumer_secret, "1.0A", urlRoot, "HMAC-SHA1");
			consumer.getOAuthRequestToken(function (error, oauthToken, oauthTokenSecret, results) {
				if (error) {
					res.send("Error getting OAuth request token : " + JSON.stringify(error), 500);
				} else {
					console.log(results);
					settings.requestToken = oauthToken;
					settings.requestTokenSecret = oauthTokenSecret;
					settings.redirect = urlRoot;
					console.log(settings);
					setSettings(settings)
						.then(() => {
							res.render('oauth_redirect', {url: 'https://api.twitter.com/oauth/authenticate?oauth_token=' + settings.requestToken});
						})
				}
			});
		});
});

app.get('/ui/oauth', (req, res) => {
	getSettings()
		.then((settings) => {
			consumer.getOAuthAccessToken(req.query.oauth_token, settings.requestTokenSecret, req.query.oauth_verifier, function (error, oauthAccessToken, oauthAccessTokenSecret, results) {
				if (error) {
					console.log(error);
					res.send("Error getting OAuth access token : " + error + "[" + oauthAccessToken + "]" + "[" + oauthAccessTokenSecret + "]" + "[" + results + "]", 500);
				} else {
					settings.access_token = oauthAccessToken;
					settings.access_token_secret = oauthAccessTokenSecret;
					setSettings(settings)
						.then(() => {
							let redirectURL = settings.redirect;
							redirectURL = redirectURL.replace('/driver-twitter/ui/oauth', '/core-ui/ui/view/driver-twitter')
							twitter.connect(settings)
								.then( (T)=> {
									monitorTwitterEvents(T, settings);
								})
							res.render('redirect', {url: redirectURL});
						});
				}
			});
		});
});

app.post('/ui/logout', (req, res) => {
	getSettings()
		.then((settings) => {
			settings.access_token = null;
			settings.access_token_secret = null;
			stopAllStreams();
			setSettings(settings)
				.then(() => {
					let redirectURL = '/driver-twitter/ui';
					res.render('redirect', {url: redirectURL});
				});
		});
});


app.post('/ui/setHashTags', function (req, res) {
	console.log("[setHashTags] body", req.body);
	let newHashTags = req.body.hashTags;
	getSettings()
		.then((settings) => {
			settings.hashTags = newHashTags.split(',');
			console.log("[SETTINGS]", settings);
			return setSettings(settings);
		})
		.then((settings) => {
			return Promise.all([twitter.connect(settings), Promise.resolve(settings)]);
		})
		.then((data) => {
			let T = data[0];
			let settings = data[1];
			stopAllStreams();
			monitorTwitterEvents(T, settings);
			res.render('index', settings);
		})
		.catch((error) => {
			console.log("[setHashTags] Error ", error);
			res.status(400).send({statusCode: 400, body: "error setting hashtags"});
		});

});

app.get("/status", function (req, res) {
	res.send("active");
});

console.log("[Creating server]");
https.createServer(credentials, app).listen(PORT);
module.exports = app;

let sc = databox.NewStoreClient(DATABOX_ZMQ_ENDPOINT, DATABOX_ARBITER_ENDPOINT, false);

let timeLine = databox.NewDataSourceMetadata();
timeLine.Description = 'Twitter user timeline data';
timeLine.ContentType = 'application/json';
timeLine.Vendor = 'Databox Inc.';
timeLine.DataSourceType = 'twitterUserTimeLine';
timeLine.DataSourceID = 'twitterUserTimeLine';
timeLine.StoreType = 'ts/blob';

let hashTag = databox.NewDataSourceMetadata();
hashTag.Description = 'Twitter user hashtag data';
hashTag.ContentType = 'application/json';
hashTag.Vendor = 'Databox Inc.';
hashTag.DataSourceType = 'twitterHashTagStream';
hashTag.DataSourceID = 'twitterHashTagStream';
hashTag.StoreType = 'ts/blob';

let userDM = databox.NewDataSourceMetadata();
userDM.Description = 'Twitter users direct messages';
userDM.ContentType = 'application/json';
userDM.Vendor = 'Databox Inc.';
userDM.DataSourceType = 'twitterDirectMessage';
userDM.DataSourceID = 'twitterDirectMessage';
userDM.StoreType = 'ts/blob';

let userRetweet = databox.NewDataSourceMetadata();
userRetweet.Description = 'Twitter users retweets';
userRetweet.ContentType = 'application/json';
userRetweet.Vendor = 'Databox Inc.';
userRetweet.DataSourceType = 'twitterRetweet';
userRetweet.DataSourceID = 'twitterRetweet';
userRetweet.StoreType = 'ts/blob';

let userFav = databox.NewDataSourceMetadata();
userFav.Description = 'Twitter users favourites tweets';
userFav.ContentType = 'application/json';
userFav.Vendor = 'Databox Inc.';
userFav.DataSourceType = 'twitterFavourites';
userFav.DataSourceID = 'twitterFavourites';
userFav.StoreType = 'ts/blob';

let testActuator = databox.NewDataSourceMetadata();
testActuator.Description = 'Test Actuator';
testActuator.ContentType = 'application/json';
testActuator.Vendor = 'Databox Inc.';
testActuator.DataSourceType = 'testActuator';
testActuator.DataSourceID = 'testActuator';
testActuator.StoreType = 'ts/blob';
testActuator.IsActuator = true;

let driverSettings = databox.NewDataSourceMetadata();
driverSettings.Description = 'Twitter driver settings';
driverSettings.ContentType = 'application/json';
driverSettings.Vendor = 'Databox Inc.';
driverSettings.DataSourceType = 'twitterSettings';
driverSettings.DataSourceID = 'twitterSettings';
driverSettings.StoreType = 'kv';


sc.RegisterDatasource(hashTag)
	// TODO find some way to replace this old functionality with the activity api
/*
	.then(() => {
		return sc.RegisterDatasource(timeLine);
	})
	.then(() => {
		return sc.RegisterDatasource(userDM);
	})
	.then(() => {
		return sc.RegisterDatasource(userRetweet);
	})
	.then(() => {
		return sc.RegisterDatasource(userFav);
	})
*/
	.then(() => {
		return sc.RegisterDatasource(testActuator);
	})
	.then(() => {
		return sc.RegisterDatasource(driverSettings);
	})
	.catch((err) => {
		console.log("Error registering data source:" + err);
	})
	.then(() => new Promise(function (resolve,reject) {
		// ensure core-network permissions are in place
		let lookup = function() {
			dns.resolve('api.twitter.com', function(err, records) {
				if (err) {
					console.log("DNS lookup failed; retrying...");
					setTimeout(lookup, 1000);
					return;
				}
				console.log("DNS ok (for twitter)");
				resolve();
			})
		}
		lookup();
	}))
	.then(() => {
		let inlineSettings = DefaultTwitConfig;
		inlineSettings.hashTags = HASH_TAGS_TO_TRACK;

		return getSettings()
		.then((settings) => {
			console.log("Twitter Auth");
			if (settings.hasOwnProperty('consumer_key')) {
				return Promise.all([twitter.connect(settings), Promise.resolve(settings)]);
			} else {
				return Promise.all([Promise.resolve(null), Promise.resolve(settings)]);
			}
		})
		.then((data) => {
			console.log("Connected to twitter!");

			let T = data[0];
			let settings = data[1];

			if (T != null) {
				monitorTwitterEvents(T, settings);
			}

		})
	})
	.catch((err) => {
		console.log("[ERROR]", err);
		getSettings()
                .then((settings) => {
			settings.access_token = null;
			settings.access_token_secret = null;
			setSettings(settings);

		})
	});

let streams = [];
const monitorTwitterEvents = (twit, settings) => {

	console.log("monitorTwitterEvents called");

	//deal with twitter events
	const HashtagStream = twit.stream('statuses/filter', {track: settings.hashTags, language: 'en'});
	streams.push(HashtagStream);
	HashtagStream.on('tweet', function (tweet) {
		save('twitterHashTagStream', tweet);
	});
	HashtagStream.on('error', function(err) {
		console.log("Hashtag stream error", err);
	});

	// TODO find some way to replace this old functionality using
	// the activity API?! but that needs webhooks...
	// https://github.com/ttezel/twit/issues/509
	// https://developer.twitter.com/en/docs/accounts-and-users/subscribe-account-activity/overview
/*
	const UserStream = twit.stream('user', {stringify_friend_ids: true, 'with': 'followings', replies: 'all'});
	streams.push(UserStream);
	UserStream.on('tweet', function (event) {
		save('twitterUserTimeLine', event);
	});

	UserStream.on('favorite', function (event) {
		save('twitterFavorite', event);
	});

	UserStream.on('quoted_tweet', function (event) {
		save('twitterRetweet', event);
	});

	UserStream.on('retweeted_retweet', function (event) {
		save('twitterRetweet', event);
	});

	UserStream.on('direct_message', function (event) {
		save('twitterDirectMessage', event);
	});
	UserStream.on('error', function(err) {
		console.log("User stream error", err);
	});
*/
};

function stopAllStreams() {
	streams.map((st) => {
		st.stop();
	});
	streams = [];
}

function getSettings() {
	datasourceid = 'twitterSettings';
	return new Promise((resolve, reject) => {
		sc.KV.Read(datasourceid, "settings")
			.then((settings) => {
				console.log("[getSettings] read response = ", settings);
				if (Object.keys(settings).length === 0) {
					//return defaults
					let settings = DefaultTwitConfig;
					settings.hashTags = HASH_TAGS_TO_TRACK;
					console.log("[getSettings] using defaults Using ----> ", settings);
					resolve(settings);
					return
				}
				console.log("[getSettings]", settings);
				resolve(settings);
			})
			.catch((err) => {
				let settings = DefaultTwitConfig;
				settings.hashTags = HASH_TAGS_TO_TRACK;
				console.log("[getSettings] using defaults Using ----> ", settings);
				resolve(settings);
			});
	});
}

function setSettings(settings) {
	let datasourceid = 'twitterSettings';
	return new Promise((resolve, reject) => {
		sc.KV.Write(datasourceid, "settings", settings)
			.then(() => {
				console.log('[setSettings] settings saved', settings);
				resolve(settings);
			})
			.catch((err) => {
				console.log("Error setting settings", err);
				reject(err);
			});
	});
}

function save(datasourceid, data) {
	console.log(`Saving tweet to ${datasourceid}::`, data.text);
	json = {"data": data};
	sc.TSBlob.Write(datasourceid, data)
		.then((resp) => {
			console.log("Save got response ", resp);
		})
		.catch((error) => {
			console.log("Error writing to store:", error);
		});
}
