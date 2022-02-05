#!/usr/bin/env node

import { MINE_OS } from "./mineos";
import server from "./server";
import auth from "./auth";
import async from "async";
import fs from "fs-extra";
import express from "express";
import compression from "compression";
import passport from "passport";
import { Strategy } from "passport-local";
import expressSession from "express-session";
import bodyParser from "body-parser";
import methodOverride from "method-override";
import { createServer } from "http";
import { randomBytes } from "crypto";
import { Command, OptionValues } from "commander";
import Q from "q";
import { Server } from 'socket.io';

import ini from "ini";
import { User } from "./mineos-app/src/app/models/user";

type WebUIArgs = {
  configFile: string;
} & OptionValues;

const sessionStore = new expressSession.MemoryStore();
const app = express();
let http = createServer(app);
const io = new Server(http);

const program = new Command();
program.option("-c, --config-file <path>");
program.parseOptions(process.argv)

const program_options = program.opts<WebUIArgs>();
const response_options = {root: __dirname};

// Authorization
const localAuth = (username, password) => {
  const deferred = Q.defer();

  auth.authenticate_shadow(username, password, authed_user => {
    if (authed_user)
      deferred.resolve({username: authed_user});
    else
      deferred.reject(new Error('incorrect password'));
  })

  return deferred.promise;
};

// Passport init
passport.serializeUser((user, done) => {
  //console.log("serializing " + user.username);
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  //console.log("deserializing " + obj);
  done(null, obj as User);
});

// Use the LocalStrategy within Passport to login users.
passport.use('local-signin', new Strategy(
  {passReqToCallback: true}, //allows us to pass back the request to the callback
  (req, username, password, done) => {
    localAuth(username, password)
      .then(user => {
        if (user) {
          console.log('Successful login attempt for username:', username);
          const logstring = new Date().toString() + ' - success from: ' + req.connection.remoteAddress + ' user: ' + username + '\n';
          fs.appendFileSync('/var/log/mineos.auth.log', logstring);
          done(null, user);
        }
      })
      .fail(err => {
        console.log('Unsuccessful login attempt for username:', username);
        const logstring = new Date().toString() + ' - failure from: ' + req.connection.remoteAddress + ' user: ' + username + '\n';
        fs.appendFileSync('/var/log/mineos.auth.log', logstring);
        done(null);
      });
  }
));

// clean up sessions that go stale over time
function session_cleanup() {
  console.log("sessions cleaned up!")
  sessionStore.clear()
}

// Simple route middleware to ensure user is authenticated.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.error = 'Please sign in!';
  res.redirect('/admin/login.html');
}

const token = randomBytes(48).toString('hex');
const sessionMiddleware = expressSession({
  secret: token,
  store: sessionStore,
  resave: false,
  saveUninitialized: false
});
app.use(bodyParser.urlencoded({extended: false}));
app.use(methodOverride());
app.use(compression());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.use((socket, next) => {
  // @ts-ignore
  if (socket.request.user) {
    next();
  } else {
    next(new Error('unauthorized'))
  }
});

function read_ini(filepath) {
  try {
    const data = fs.readFileSync(filepath);
    return ini.parse(data.toString());
  } catch (e) {
    return null;
  }
}

MINE_OS.dependencies((err, binaries) => {
  process.on('unhandledRejection', (reason, promise) => {
    console.log(reason)
  })
  process.on('uncaughtException', (reason) => {
    console.log(reason)
  })
  let USE_NEW_UI;
  if (err) {
    console.error('MineOS is missing dependencies:', err);
    console.log(binaries);
    process.exit(1);
  }

  const process_opt_config = program_options.configFile;
  if (process_opt_config) {
    console.log(`Config file given on CMD, using ${process_opt_config} as config file`)
  }
  const mineos_config = read_ini(process_opt_config) || read_ini('/etc/mineos.conf') || read_ini('/usr/local/etc/mineos.conf') || {};
  let base_directory = '/var/games/minecraft';

  if ('base_directory' in mineos_config) {
    try {
      if (mineos_config['base_directory'].length < 2)
        throw new Error('Invalid base_directory length.');

      base_directory = mineos_config['base_directory'];
      fs.ensureDirSync(base_directory);

    } catch (e: any) {
      console.error(e.message, 'Aborting startup.');
      process.exit(2);
    }

    console.info('base_directory found in mineos.conf, using:', base_directory);
  } else {
    console.error('base_directory not specified--missing mineos.conf?');
    console.error('Aborting startup.');
    process.exit(4);
  }

  const be = new server.backend(base_directory, io, mineos_config);

  app.get('/', (req, res) => {
    if (USE_NEW_UI) {
      res.redirect('/ui');
    } else {
      res.redirect('/admin/index.html');
    }
  });

  app.get('/admin/index.html', ensureAuthenticated, (req, res) => {
    res.sendFile('/html/index.html', response_options);
  });

  app.get('/login', (req, res) => {
    res.sendFile('/html/login.html');
  });

  app.post('/auth', passport.authenticate('local-signin', {
      successRedirect: '/admin/index.html',
      failureRedirect: '/admin/login.html'
    })
  );

  app.get('/api/auth/is-authenticated', (req, res) => {
    console.log("is-authenticated", "check auth state..")
    let result = {authenticated: false};
    if (req.isAuthenticated()) {
      result.authenticated = true;
    }
    console.log("is-authenticated?: ", result.authenticated)
    res.json(result);
    res.end();
  });

  // Page redirect/routing managed by the ui AuthGaurd class
  app.post('/api/auth',
    passport.authenticate('local-signin'),
    (req, res) => {
      // @ts-ignore
      res.json({username: req.user?.username});
      res.end();
    }
  );

  app.get('/api/logout', (req, res) => {
    req.logout();
    res.end();
  });

  app.all('/api/:server_name/:command', ensureAuthenticated, (req, res) => {
    const target_server = req.params.server_name;
    // @ts-ignore
    const user = req.user?.username;
    const instance = be.servers[target_server];

    const args = req.body;
    args['command'] = req.params.command;

    if (instance)
      instance.direct_dispatch(user, args);
    else
      console.error('Ignoring request by "', user, '"; no server found named [', target_server, ']');

    res.end();
  });

  app.post('/admin/command', ensureAuthenticated, (req, res) => {
    const target_server = req.body.server_name;
    const instance = be.servers[target_server];
    // @ts-ignore
    const user = req.user?.username;

    if (instance)
      instance.direct_dispatch(user, req.body);
    else
      console.error('Ignoring request by "', user, '"; no server found named [', target_server, ']');

    res.end();
  });

  app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/admin/login.html');
  });

  app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io'));
  app.use('/angular', express.static(__dirname + '/node_modules/angular'));
  app.use('/angular-translate', express.static(__dirname + '/node_modules/angular-translate/dist'));
  app.use('/moment', express.static(__dirname + '/node_modules/moment'));
  app.use('/angular-moment', express.static(__dirname + '/node_modules/angular-moment'));
  app.use('/angular-moment-duration-format', express.static(__dirname + '/node_modules/moment-duration-format/lib'));
  app.use('/angular-sanitize', express.static(__dirname + '/node_modules/angular-sanitize'));
  app.use('/admin', express.static(__dirname + '/html'));
  app.use('/ui/', express.static(__dirname + '/ui'));

  process.on('SIGINT', () => {
    console.log("Caught interrupt signal; closing webui....");
    be.shutdown();
    process.exit();
  });

  let SOCKET_PORT: number | undefined = undefined;
  let SOCKET_HOST: string = '0.0.0.0';
  let USE_HTTPS = true;
  USE_NEW_UI = false;

  if ('use_new_ui' in mineos_config)
    USE_NEW_UI = mineos_config['use_new_ui'];

  if ('use_https' in mineos_config)
    USE_HTTPS = mineos_config['use_https'];

  if ('socket_host' in mineos_config)
    SOCKET_HOST = mineos_config['socket_host'] as string;

  if ('socket_port' in mineos_config)
    SOCKET_PORT = mineos_config['socket_port'];
  else if (USE_HTTPS)
    SOCKET_PORT = 8443;
  else
    SOCKET_PORT = 8080;

  if (USE_HTTPS) {
    let keyfile = mineos_config['ssl_private_key'] || '/etc/ssl/certs/mineos.key';
    let certfile = mineos_config['ssl_certificate'] || '/etc/ssl/certs/mineos.crt';
    async.parallel({
      key: async.apply(fs.readFile, keyfile),
      cert: async.apply(fs.readFile, certfile)
    }, (err, ssl) => {
      if (err) {
        console.error('Could not locate required SSL files ' + keyfile +
          ' and/or ' + certfile + ', aborting server start.');
        process.exit(3);
      } else {
        const https = require('https');

        if ('ssl_cert_chain' in mineos_config) {
          try {
            const cert_chain_data = fs.readFileSync(mineos_config['ssl_cert_chain']);
            if (cert_chain_data.length)
              ssl['ca'] = cert_chain_data;
          } catch (e) {
          }
        }

        const https_server = https.createServer(ssl, app).listen(SOCKET_PORT, SOCKET_HOST, () => {
          io.attach(https_server);
          console.log('MineOS webui listening on HTTPS://' + SOCKET_HOST + ':' + SOCKET_PORT);
        });
      }
    })
  } else {
    console.warn('mineos.conf set to host insecurely: starting HTTP server.');
    http.listen(SOCKET_PORT, SOCKET_HOST, () => {
      console.log('MineOS webui listening on HTTP://' + SOCKET_HOST + ':' + SOCKET_PORT);
    });
    http.on('error', (e) => {
      console.log("http encountered error: ", e);
    });
  }

  setInterval(session_cleanup, 3600000); //check for expired sessions every hour

})
