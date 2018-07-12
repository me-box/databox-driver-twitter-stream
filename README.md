# driver-twitter

A Databox driver to stream data from twitter. This driver supports twitter streaming API and uses app auth. 

Its provides an example of settings persistance and the use of datasources. It also has a test actuator. 


# Status

This is work in progress but getting better ;-).

# Authentication

If you wish to use this driver with your own twitter account then. 

     - Go to https://apps.twitter.com/ and log in 
     - Click create new app
     - Fill in the form (set website to http://127.0.0.1) agree to the T&C's 
     - Then go to the 'Keys and Access Tokens' tab
     - Click on "Create my access token"
     - Then in databox find the driver tab and click on the twitter driver
     - Copy and past Consumer Key, Consumer Secret, Access Token, Access Token Secret into the driver and click save. 

# Data stored
This driver writes twitter event data into a store-json for later processing.

It saves the following streams of data:

    1. twitterUserTimeLine - the logged in users timeline
    2. twitterHashTagStream - tweets that contain #raspberrypi, #mozfest, #databox, #iot and #NobelPrize
    3. twitterDirectMessage - a list of the users' direct messages 
    4. twittrRetweet - a list of the users' retweets 
    5. twitterFavorite - a list of the users favourited

These can then be accessed store-json API.


# Implementing OAuth in Databox


## Authentication Callback

The callback url is passed to the OAuth authenication process and allows the authentication page to redirect the user 
back to the driver. This url differs between the app and web versions of the container manager and so the container 
manager passes the url to the driver as a query parameter when the root ui page is requested. 

The twitter driver extracts this from the url and passes it to twitter when the twitter login process is started.

eg.
```
https://localhost/driver-twitter/ui?oauth=http%3A%2F%2Flocalhost%2Fdriver-twitter%2Fui
```

## Redirecting to the Authentication Page

Many oauth procedures don't allow you to display the page which grants permission from within a frame or a WebView. 
These are exactly the technologies the container manager uses to display the driver's user interface. So, the first
challenge is to escape from the frame to display the page. You can do this by posting a message to the container manager.
The following code tells the container manager to redirect the user to the twitter authentication page for the given token. 

```javascript
window.parent.postMessage({ type:'databox_oauth_redirect', url: 'https://api.twitter.com/oauth/authenticate?oauth_token=' + token}, '*');
```

In the app, this will open the page in a new browser window, where the 

