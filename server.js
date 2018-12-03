require('dotenv').config();
var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var _ = require('lodash');
var Pusher = require('pusher');
var elasticsearch = require('elasticsearch');
var low = require('lowdb');
var FileSync = require('lowdb/adapters/FileSync');
var adapter = new FileSync('db.json');
var db = low(adapter);

var pusher = new Pusher({
    appId: process.env.PUSHER_APP,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    encrypted: true
});

var client = new elasticsearch.Client({
  host: process.env.ES_HOST,
  httpAuth: process.env.ES_AUTH,
  log: 'trace'
});

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/bower_components', express.static(path.join(__dirname, 'bower_components')));
app.use('/build', express.static(path.join(__dirname, 'build')));
app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use('/plugins', express.static(path.join(__dirname, 'plugins')));

function initDB() {
    if(!db.has('apiTime').value()) {
        db.defaults({ 
          apiTime : {
            sma: [],
            crm: []
          }
        }).write();
    }
}

function getLog(index, from, to) {
  client.search({
    index: index,
    type: 'log',
    body: {
      from: 0,
      size: 100,
      query: {
        bool: {
          must: [
            { regexp: { "message": "api:*" } },
            { regexp: { "message": "time:*" } },
            { range: { "@timestamp": { "gte": from, "lte": to } } }
          ]
        }
      }
    }
  }).then(function(resp) {
      var map = {};
      _.each(resp.hits.hits, function(value) {
        addToMap(map, extractMsg(value._source.message));
      });
      const data = { 
        from: from,
        value: convertToAvg(map)
      };
      db.get('apiTime').get('sma')
        .push(data)
        .write();
      pusher.trigger('api-time', 'new-data', data);
  }, function(err) {
      console.trace(err.message);
  });
}

function extractMsg(msg) {
  // API:/auth/login, Staff: tmd_flixgdbh, Time: 336 ms 
  const parts = msg.split(',')
  const apiPart = parts[0];
  const timePart = parts[parts.length - 1];

  const api = getValue(apiPart);
  const time = getValue(timePart);
  return { api: api, time: time.match(/\d+/g)[0] };
}

function getValue(part) {
  return part.split(':')[1];
}

function addToMap(map, data) {
  const api = data.api;
  if (!map[api]) {
    map[api] = [];
  }
  map[api] = _.union(map[api], [data.time]);
}

function convertToAvg(map) {
  const newMap = {};
  _.forOwn(map, function(value, key) {
    newMap[key] = getAvg(value);
  });
  return newMap;
}

function getAvg(arr) {
  let sum = 0;
  const len = arr.length;
  for( let i = 0; i < arr.length; i++ ){
    sum += parseInt( arr[i], 10 );
  }
  return sum / len;
}


function getCurrentTime() {
  const d = new Date();
  return { 
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours()
  }
}

function getCurrentIndex(prefix) {
  const t = getCurrentTime();
  return prefix + t.year + "-" + (t.month + 1) + "-" + getValidDay(t.day);
}

function getValidDay(val) {
  const value = val + '';
  return value.length > 1 ? value : ('0' + value);
}

function getLastData() {
  return _.last(db.get('apiTime').get('sma').value());
}

app.get('/init', function(req, res) {
  res.send(getLastData());
});

app.get('/favicon.ico', function(req, res) {
    res.status(204);
});

// Error Handler for 404 Pages
app.use(function(req, res, next) {
    console.log(req.url);
    var error404 = new Error('Route Not Found');
    error404.status = 404;
    next(error404);
});

module.exports = app;

initDB();
function makeInterval() {
  var d = new Date();
  var min = d.getMinutes();
  var sec = d.getSeconds();

  if((min == '00') && (sec == '00'))
    getFullLog();
  else
    setTimeout(getFullLog, (60 * (60 - min) + (60 - sec)) * 1000);
}

makeInterval();

function getFullLog() {
  const curr = getCurrentTime();
  getLog(getCurrentIndex(process.env.PREFIX), 
    new Date(Date.UTC(curr.year, curr.month, curr.day, curr.hour - 1, 0, 0)), 
    new Date(Date.UTC(curr.year, curr.month, curr.day, curr.hour, 0, 0)));
}

app.listen(process.env.PORT || 3000, function(){
  console.log("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
});
