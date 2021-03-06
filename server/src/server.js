const path = require('path');
const Cookies = require("cookies");

const { Shot } = require("./servershot");
const { checkLogin, registerLogin } = require("./users");
const dbschema = require("./dbschema");
const express = require("express");
const bodyParser = require('body-parser');
const morgan = require("morgan");
const linker = require("./linker");
const config = require("./config").root();

dbschema.createTables();
dbschema.createKeygrip();

const app = express();

app.set('trust proxy', true);

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json({limit: '100mb'}));

app.use("/static", express.static(path.join(__dirname, "static"), {
  index: false
}));

app.use(morgan("dev"));

app.use(function (req, res, next) {
  let cookies = new Cookies(req, res, dbschema.getKeygrip());
  req.userId = cookies.get("user", {signed: true});
  req.backend = req.protocol + "://" + req.headers.host;
  req.config = config;
  next();
});

app.use(function (req, res, next) {
  req.staticLink = linker.staticLink;
  req.staticLinkWithHost = linker.staticLinkWithHost.bind(null, req);
  next();
});

app.use(function (err, req, res, next) {
  console.error("Error:", err);
  console.error(err.stack);
  errorResponse(res, "General error:", err);
});

app.post("/api/register", function (req, res) {
  let vars = req.body;
  // FIXME: need to hash secret
  let canUpdate = vars.userId === req.userId;
  return registerLogin(vars.userId, {
    secret: vars.secret,
    nickname: vars.nickname || null,
    avatarurl: vars.avatarurl || null
  }, canUpdate).then(function (ok) {
    if (ok) {
      let cookies = new Cookies(req, res, dbschema.getKeygrip());
      cookies.set("user", vars.userId, {signed: true});
      simpleResponse(res, "Created", 200);
    } else {
      simpleResponse(res, "User exists", 401);
    }
  }).catch(function (err) {
    errorResponse(res, "Error registering:", err);
  });
});

app.post("/api/login", function (req, res) {
  let vars = req.body;
  checkLogin(vars.userId, vars.secret).then((ok) => {
    if (ok) {
      let cookies = new Cookies(req, res, dbschema.getKeygrip());
      cookies.set("user", vars.userId, {signed: true});
      simpleResponse(res, "User logged in", 200);
    } else {
      simpleResponse(res, "Invalid login", 401);
    }
  }).catch(function (err) {
    errorResponse(err, "Error in login:", err);
  });
});

app.get("/clip/:id/:domain/:clipId", function (req, res) {
  let shotId = req.params.id + "/" + req.params.domain;
  Shot.get(req.backend, shotId).then((shot) => {
    let clip = shot.getClip(req.params.clipId);
    if (! clip) {
      simpleResponse(res, "No such clip", 404);
      return;
    }
    let image = clip.imageBinary();
    res.set("Content-Type", image.contentType);
    res.send(image.data);
  }).catch((err) => {
    errorResponse(res, "Failed to get clip", err);
  });
});

app.put("/data/:id/:domain", function (req, res) {
  let bodyObj = req.body;
  if (typeof bodyObj != "object") {
    throw new Error("Got unexpected req.body type: " + typeof bodyObj);
  }
  let shotId = req.params.id + "/" + req.params.domain;

  if (! bodyObj.userId) {
    console.warn("No userId in request body", req.url);
    simpleResponse(res, "No userId in body", 400);
    return;
  }
  if (! req.userId) {
    console.warn("Attempted to PUT without logging in", req.url);
    simpleResponse(res, "Not logged in", 401);
    return;
  }
  if (req.userId != bodyObj.userId) {
    // FIXME: this doesn't make sense for comments or other stuff, see https://github.com/mozilla-services/pageshot/issues/245
    console.warn("Attempted to PUT a page with a different userId than the login userId");
    simpleResponse(res, "Cannot save a page on behalf of another user", 403);
    return;
  }
  let shot = new Shot(req.userId, req.backend, shotId, bodyObj);
  shot.insert().then((inserted) => {
    if (! inserted) {
      return shot.update();
    }
    return null;
  }).then(() => {
    simpleResponse(res, "Saved", 200);
  }).catch((err) => {
    errorResponse(res, "Error saving Object:", err);
  });
});

app.get("/data/:id/:domain", function (req, res) {
  let shotId = req.params.id + "/" + req.params.domain;
  Shot.getRawValue(shotId).then((data) => {
    if (! data) {
      simpleResponse(res, "No such shot", 404);
    } else {
      let value = data.value;
      if ('format' in req.query) {
        value = JSON.stringify(JSON.parse(value), null, '  ');
      }
      res.set("Content-Type", "application/json");
      res.send(value);
    }
  }).catch(function (err) {
    errorResponse(res, "Error serving data:", err);
  });
});

app.get("/content/:id/:domain", function (req, res) {
  let shotId = req.params.id + "/" + req.params.domain;
  Shot.get(req.backend, shotId).then((shot) => {
    if (! shot) {
      simpleResponse(res, "Not found", 404);
      return;
    }
    res.send(shot.staticHtml({
      addHead: `
      <base href="${shot.url}" target="_blank" />
      <script src="http:${req.staticLinkWithHost("js/content-helper.js")}"></script>
      <link rel="stylesheet" href="http:${req.staticLinkWithHost("css/content.css")}">
      `
    }));
  }).catch(function (e) {
    errorResponse(res, "Failed to load shot", e);
  });
});

app.get("/", function (req, res) {
  require("./views/main").render(req, res);
});

app.get("/:id/:domain", function (req, res) {
  let shotId = req.params.id + "/" + req.params.domain;
  Shot.get(req.backend, shotId).then((shot) => {
    if (! shot || shot.clipNames().length === 0) {
      simpleResponse(res, "Not found", 404);
      return;
    }
    req.shot = shot;
    return require("./views/frame").render(req, res);
  }).catch(function (err) {
    errorResponse(res, "Error rendering page:", err);
  });
});

function simpleResponse(res, message, status) {
  status = status || 200;
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.status(status);
  res.send(message);
}

function errorResponse(res, message, err) {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.status(500);
  if (err) {
    message += "\n" + err;
    if (err.stack) {
      message += "\n\n" + err.stack;
    }
  }
  res.send(message);
  console.error("Error: " + message, err+"", err);
}

linker.init().then(() => {
  app.listen(config.port);
  console.log(`server listening on http://localhost:${config.port}/`);
}).catch((err) => {
  console.error("Error getting revision:", err, err.stack);
});
