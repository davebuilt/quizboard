const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const https = require('https');
const timers = require('timers');

// Define our quiz provider.
var questionRequest = {
  host: 'opentdb.com',
  port: 443,
  path: '/api.php?amount=25&type=multiple&encode=urlLegacy',
  method: 'GET'
};

// Set up our quiz buffer.
let questionQueue = [];
let currentQuestion = {};
let questionTime = 20;

//Set up our simple player tracker
let playerNumber = 0;
let currentPlayers = {};

//Populate our queue.
pullQuestion().then((question) => {
    currentQuestion = question;
});

// Set up a timer to push a question every x seconds
timers.setInterval(function() {

  pullQuestion().then((question) => {
      currentQuestion = question;
      io.emit('question', JSON.stringify(currentQuestion));
  });

}, questionTime * 1000);

// Set up the SPA host.
app.get('/', function(req, res){
  res.sendFile(__dirname + '/public/index.html');
});

// Set up the web sockets for communication.
io.on('connection', function(socket){

  //Increment the player numver
  playerNumber++;

  // Set up variables for this user.
  var playId = playerNumber;
  var playNickname = '';

  console.log('Player Connected:', playId);

  // Send the current question to the user when they connect.
  socket.emit('initPlayId', playId);
  socket.emit('question', JSON.stringify(currentQuestion));
  socket.emit('currentPlayers', JSON.stringify(currentPlayers));


  // Set up the nickname when it comes in.
  socket.on('userNew', function(newNickname) {
    setNickname(newNickname);
    setScoreBoard(0);
  });

  // Register a user's score changing answer.
  socket.on('userAnswered', function(userJson) {
    var userObj = JSON.parse(userJson);

    setNickname(userObj.nickname);
    setScoreBoard(userObj.score);
    console.log('Score', playNickname + ': ' + userObj.score);
  });

  // Clean up players when they disconnect.
  socket.on('disconnect', function(){
    console.log('Player Disconnected:', playId);
    removePlayer();
  });

  /** Function to set the nickname if not already set **/
  function setNickname(newNickname) {
    if(!playNickname.length) {
      console.log('New Player: ', newNickname);
      playNickname = newNickname;
    }
  }

  /** Set the score for the current player. **/
  function setScoreBoard(newScore) {

    var newScoreObj = {
      'playId': playId,
      'nickname': playNickname,
      'score': newScore,
    };
    currentPlayers[playId] = newScoreObj;
    socket.broadcast.emit('playerScored', JSON.stringify(newScoreObj));
  }

  /** Remove the current player and broadcast to other players. **/
  function removePlayer() {
      delete currentPlayers[playId];
      socket.broadcast.emit('playerDisconnect', playId);
  }

});

// Start the Web server for the main app.
http.listen(80, function(){
  console.log('listening on *:80');
});

/** Fetch questions and add them to the buffer */
function fetchQuestions() {

  return new Promise((resolve, reject) => {

      console.log('Quiz: Fetching questions.');
      https.request(questionRequest, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          var quizData = JSON.parse(chunk);

          //Distill the quiz questions into our queue.
          quizData.results.forEach(function(question) {
              questionQueue.push(question);
          });
          resolve();
        });
      }).end();
  });

}

/** Pull a question from the buffer into current. */
function pullQuestion() {
  return new Promise((resolve, reject) => {

    // If the queue is less than 10 in length
    // then we will pull quiz questions in.
    console.log('Quiz: Asking a question.');
    if(questionQueue.length < 10) {
      fetchQuestions().then(() => {
        resolve(questionQueue.shift());
      });
    } else {
      resolve(questionQueue.shift());
    }

  });
}
