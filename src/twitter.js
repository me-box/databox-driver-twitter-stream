/*jshint esversion: 6 */

const Twit = require('twit');

module.exports = function () {

	let isSignedIn = false;
	let T = null;

	const connect = function (creds) {
		console.log("Connecting to twitter!!");

		isSignedIn = false;

		return new Promise((resolve, reject) => {
			T = new Twit({
				consumer_key: creds.consumer_key,
				consumer_secret: creds.consumer_secret,
				access_token: creds.access_token,
				access_token_secret: creds.access_token_secret,
				timeout_ms: 60 * 1000,  // optional HTTP request timeout to apply to all requests.
			});

			T.get('account/verify_credentials', {}, function (err, data, response) {
				if (err) {
					reject(err);
					return;
				}
				resolve(T);
			})
				.then(() => {
					isSignedIn = true;
					console.log('Creds OK');
				})
				.catch((err) => {
					reject(err);
					isSignedIn = false;
				});
		});

	};

	return {
		'Twit': T,
		'isSignedIn': function () {
			return isSignedIn;
		},
		'connect': connect
	};
};