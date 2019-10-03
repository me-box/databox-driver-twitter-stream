# driver-twitter

A Databox driver to stream data from twitter. This driver supports twitter streaming API and uses app auth.

Its provides an example of settings persistence and the use of data sources. It also has a test actuator.


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

    1. twitterHashTagStream - tweets that contain #raspberrypi, #mozfest, #databox, #iot and #NobelPriz (hashtags can be changed in the driver settings)

These can then be accessed store-json API.

The driver used to provide the following from the user stream, but this
is no longer supported:

    2. twitterUserTimeLine - the logged in users timeline
    3. twitterDirectMessage - a list of the users' direct messages
    4. twittrRetweet - a list of the users' retweets
    5. twitterFavorite - a list of the users favourited

The latter items can now only be accessed via webhooks, so not direct to
a NATed databox driver!

## A tweet

Here's an example tweet (i.e. what appears as the data: value):
```
{ created_at: 'Thu Oct 03 20:19:00 +0000 2019',
     id: 1179853378215694300,
     id_str: '1179853378215694336',
     text: 'well, to be honest, quite of lot of time is trying to make databox work for #enablingtechnologies2019',
     source: '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
     truncated: false,
     in_reply_to_status_id: null,
     in_reply_to_status_id_str: null,
     in_reply_to_user_id: null,
     in_reply_to_user_id_str: null,
     in_reply_to_screen_name: null,
     user: 
      { id: 1176966706696245200,
        id_str: '1176966706696245249',
        name: 'Chris Greenhalgh',
        screen_name: 'ChrisGreenhal14',
        location: null,
        url: null,
        description: null,
        translator_type: 'none',
        protected: false,
        verified: false,
        followers_count: 0,
        friends_count: 0,
        listed_count: 0,
        favourites_count: 0,
        statuses_count: 4,
        created_at: 'Wed Sep 25 21:08:45 +0000 2019',
        utc_offset: null,
        time_zone: null,
        geo_enabled: false,
        lang: null,
        contributors_enabled: false,
        is_translator: false,
        profile_background_color: 'F5F8FA',
        profile_background_image_url: '',
        profile_background_image_url_https: '',
        profile_background_tile: false,
        profile_link_color: '1DA1F2',
        profile_sidebar_border_color: 'C0DEED',
        profile_sidebar_fill_color: 'DDEEF6',
        profile_text_color: '333333',
        profile_use_background_image: true,
        profile_image_url: 'http://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        profile_image_url_https: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        default_profile: true,
        default_profile_image: false,
        following: null,
        follow_request_sent: null,
        notifications: null },
     geo: null,
     coordinates: null,
     place: null,
     contributors: null,
     is_quote_status: false,
     quote_count: 0,
     reply_count: 0,
     retweet_count: 0,
     favorite_count: 0,
     entities: { hashtags: [Array], urls: [], user_mentions: [], symbols: [] },
     favorited: false,
     retweeted: false,
     filter_level: 'low',
     lang: 'en',
     timestamp_ms: '1570133940639' }
```

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
These are exactly the technologies the container manager uses to display the driver's user interface. So, the driver
needs to escape from the frame to display the page. You can do this by posting a message to the container manager.

```javascript
window.parent.postMessage({ type:'databox_oauth_redirect', url: 'https://api.twitter.com/oauth/authenticate?oauth_token=' + token}, '*');
```

In the app, will use a version of Safari (iOS) or Chrome (Android) to open the given page, where the web version will
redirect the browser.

In the twitter driver, the authentication process is triggered from a post request. An otherwise empty web page is
returned from the request with the above code in a script tag to redirect once the post request finishes.

## Databox is funded by the following grants:

```
EP/N028260/1, Databox: Privacy-Aware Infrastructure for Managing Personal Data

EP/N028260/2, Databox: Privacy-Aware Infrastructure for Managing Personal Data

EP/N014243/1, Future Everyday Interaction with the Autonomous Internet of Things

EP/M001636/1, Privacy-by-Design: Building Accountability into the Internet of Things (IoTDatabox)

EP/M02315X/1, From Human Data to Personal Experience

```