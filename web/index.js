'use strict';

let     express = require('express'),
		router = express.Router(),
		mongoose = require('mongoose'),
		bodyParser = require('body-parser'),
		wetty = require('./wetty'),
		passport = require('passport'),
		LocalStrategy = require('passport-local'),
		http = require('http'),
		https = require('https'),
		fs = require('fs'),
		path = require('path'),
		pty = require('pty'),
		sockio = require('socket.io'),
        session = require('express-session'),
        exphbs = require('express-handlebars'),
        methodOverride = require('method-override')
		;

const default_port = 8080;
let usehttps = false;
let sshport = 22;
let sshhost = 'localhost';
let sshauth = 'password,keyboard-interactive';
let sockpath = '/wetty/socket.io/';
let globalsshuser = '';
let sslconf, httpserv;

const opts = require('optimist')
	.options({
		sslkey: {
			demand: false,
			description: 'path to SSL key',
		},
		sslcert: {
			demand: false,
			description: 'path to SSL cert',
		},
		port: {
			demand: false,
			description: 'port to run on. default: 8080',
		},
	}).boolean('allow_discovery').argv;

// Check params:
const port = ((opts.port) ? opts.port : default_port);

if(opts.sslkey && opts.sslcert) {
	usehttps = true;
	sslconf = {
		key: fs.readFileSync(path.resolve(opts.sslkey)),
		cert: fs.readFileSync(path.resolve(opts.sslcert)),
	};
}

let app = express();

if(usehttps) {
	console.log('https on port ' + port);
	httpserv = https.createServer(sslconf, app);
}
else {
	console.log('http on port ' + port);
	httpserv = http.createServer(app);
}

var config = require('./config.js'),
    funct = require('./functions.js');

//===============PASSPORT===============
// Use the LocalStrategy within Passport to login/"signin" users.
passport.use('local-signin', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localAuth(username, password)
    .then(function (user) {
      if (user) {
        console.log("LOGGED IN AS: " + user.username);
        req.session.success = 'You are successfully logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT LOG IN");
        req.session.error = 'Could not log user in. Please try again.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));
// Use the LocalStrategy within Passport to register/"signup" users.
passport.use('local-signup', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localReg(username, password)
    .then(function (user) {
      if (user) {
        console.log("REGISTERED: " + user.username);
        req.session.success = 'You are successfully registered and logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT REGISTER");
        req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));

// Passport session setup.
passport.serializeUser(function(user, done) {
  console.log("serializing " + user.username);
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  console.log("deserializing " + obj);
  done(null, obj);
});

app.use(bodyParser.urlencoded({
	extended: true,
}));
app.use(bodyParser.json());
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(session({secret: 'yasha', saveUninitialized: true, resave: true}));
app.use(passport.initialize());
app.use(passport.session());

// Configure express to use handlebars templates
var hbs = exphbs.create({
    defaultLayout: 'main', //we will be creating this layout shortly
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// Session-persisted message middleware
app.use(function(req, res, next){
  var err = req.session.error,
      msg = req.session.notice,
      success = req.session.success;

  delete req.session.error;
  delete req.session.success;
  delete req.session.notice;

  if (err) res.locals.error = err;
  if (msg) res.locals.notice = msg;
  if (success) res.locals.success = success;

  next();
});

// Simple route middleware to ensure user is authenticated.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.session.error = 'Please sign in!';
  res.redirect('/signin');
}

//===============ROUTES=================
//app.use('/', express.static(__dirname + '/frontend/_site/'));
//displays our homepage
app.get('/', function(req, res){
  res.render('home', {user: req.user});
});

//displays our signup page
app.get('/signin', function(req, res){
  res.render('signin');
});

//sends the request through our local signup strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/local-reg', passport.authenticate('local-signup', {
  successRedirect: '/',
  failureRedirect: '/signin'
  })
);

//sends the request through our local login/signin strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/login', passport.authenticate('local-signin', {
  successRedirect: '/',
  failureRedirect: '/signin'
  })
);

//logs user out of site, deleting them from the session, and returns to homepage
app.get('/logout', function(req, res){
  var name = req.user.username;
  console.log("LOGGIN OUT " + req.user.username)
  req.logout();
  res.redirect('/');
  req.session.notice = "You have successfully been logged out " + name + "!";
});
app.use('/wetty', wetty(opts, httpserv));

httpserv.listen(port);