let parsedUrl = new URL(window.location.href);
const oauth = parsedUrl.searchParams.get("oauth");
if(oauth) {
	document.getElementById('callback').value = oauth;
} else {
	document.getElementById('callback').value = document.baseURI + 'oauth';
}

document.getElementById('save_hashtags').addEventListener('click', function () {
	const hashTags = document.getElementById('hashTags').value;
	console.log('hashTags', hashTags)
	fetch('setHashTags', {
		method: "POST", 
		credentials: "include", 
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({'hashTags': hashTags})
	})
		.then(function () {
			document.getElementById('hashtag_msg').innerText = "Saved!"
		})
});

const fields = document.getElementsByClassName('mdc-text-field');
for (let field of fields) {
	mdc.textField.MDCTextField.attachTo(field);
}
