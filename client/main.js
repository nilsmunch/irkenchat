Handlebars.registerHelper('toCapitalCase', function(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
});



Template.messages.helpers({
    messages: function() {

        var game = getCurrentGame();

        var element = document.getElementById("chat");
        if (element != null) element.scrollTop = element.scrollHeight;
        return Messages.find({"game":game._id}, { sort: { time: 1}}).fetch();
    }
});

Template.players.helpers({
  players: function () {
    var game = getCurrentGame();
    var currentPlayer = getCurrentPlayer();

    if (!game) {
      return null;
    }

    var players = Players.find({'gameID': game._id}, {'sort': {'createdAt': 1}}).fetch();

    var me = getCurrentPlayer();
    players.forEach(function(player){

      if (player.role == "SPECTATOR") {
        return;
      }
      if (player.kicked) {
        return;
      }

      if (player._id === currentPlayer._id){
        player.isCurrent = true;
        if (me.isSpy) {
            player.role = 'CHAT BOT';
            return;
        }
      } else {
        if (game.state != "waitingForPlayers") player.role = 'Unknown';
      }
      if (me.isSpy && game.state != "waitingForPlayers") {
        player.role = 'Unknown';
      }
      if (game.state === "waitingForPlayers" && player.isSpy) player.role = 'CHAT BOT';


    });

    return players;
  }
});


function initUserLanguage() {
  var language = amplify.store("language");

  if (language){
    Session.set("language", language);
  }

  setUserLanguage(getUserLanguage());
}

function getUserLanguage() {
  var language = Session.get("language");
  if (language){
    return language;
  } else {
    return "en";
  }
};

function setUserLanguage(language) {
  TAPi18n.setLanguage(language).done(function () {
    Session.set("language", language);
    amplify.store("language", language);
  });
}

function getLanguageDirection() {
  var language = getUserLanguage()
  var rtlLanguages = ['he', 'ar'];

  if ($.inArray(language, rtlLanguages) !== -1) {
    return 'rtl';
  } else {
    return 'ltr';
  }
}

function getLanguageList() {
  var languages = TAPi18n.getLanguages();
  var languageList = _.map(languages, function(value, key) {
    var selected = "";
    
    if (key == getUserLanguage()){
      selected = "selected";
    }

    // Gujarati isn't handled automatically by tap-i18n,
    // so we need to set the language name manually
    if (value.name == "gu"){
        value.name = "ગુજરાતી";
    }

    return {
      code: key,
      selected: selected,
      languageDetails: value
    };
  });
  
  if (languageList.length <= 1){
    return null;
  }
  
  return languageList;
}

function getCurrentGame(){
  var gameID = Session.get("gameID");

  if (gameID) {
    return Games.findOne(gameID);
  }
}

function getAccessLink(){
  var game = getCurrentGame();

  if (!game){
    return;
  }

  return Meteor.settings.public.url + game.accessCode + "/";
}


function getCurrentPlayer(){
  var playerID = Session.get("playerID");

  if (playerID) {
    return Players.findOne(playerID);
  }
}

function generateAccessCode(){
  var code = "";
  var possible = "abcdefghijklmnopqrstuvwxyz";

    for(var i=0; i < 3; i++){
      code += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return code;
}

function generateNewGame(){
  var game = {
    accessCode: generateAccessCode(),
    state: "waitingForPlayers",
    location: null,
    lengthInMinutes: 5,
    endTime: null,
    paused: false,
    pausedTime: null
  };

  var gameID = Games.insert(game);
  game = Games.findOne(gameID);

  return game;
}

function generateNewPlayer(game, name){
  var player = {
    gameID: game._id,
    avatar:generateAccessCode(),
    name: name,
    role: null,
    isSpy: false,
    score :0,
    isFirstPlayer: false
  };

  var playerID = Players.insert(player);

  return Players.findOne(playerID);
}

function resetUserState(){
  var player = getCurrentPlayer();

  if (player){
    Players.remove(player._id);
  }

  Session.set("gameID", null);
  Session.set("playerID", null);
}

function trackGameState () {
  var gameID = Session.get("gameID");
  var playerID = Session.get("playerID");

  if (!gameID || !playerID){
    return;
  }

  var game = Games.findOne(gameID);
  var player = Players.findOne(playerID);

  if (!game || !player){
    Session.set("gameID", null);
    Session.set("playerID", null);
    Session.set("currentView", "startMenu");
    return;
  }

  if(game.state === "inProgress"){
    Session.set("currentView", "gameView");
  } else if (game.state === "waitingForPlayers") {
    Session.set("currentView", "lobby");
  }
}

function leaveGame () {  
  GAnalytics.event("game-actions", "gameleave");
  var player = getCurrentPlayer();

  Session.set("currentView", "startMenu");
  Players.remove(player._id);

  Session.set("playerID", null);
}

function hasHistoryApi () {
  return !!(window.history && window.history.pushState);
}

initUserLanguage();

Meteor.setInterval(function () {
  Session.set('time', new Date());
}, 1000);

if (hasHistoryApi()){
  function trackUrlState () {
    var accessCode = null;
    var game = getCurrentGame();
    if (game){
      accessCode = game.accessCode;
    } else {
      accessCode = Session.get('urlAccessCode');
    }
    
    var currentURL = '/';
    if (accessCode){
      currentURL += accessCode+'/';
    }
    window.history.pushState(null, null, currentURL);
  }
  Tracker.autorun(trackUrlState);
}
Tracker.autorun(trackGameState);

window.onbeforeunload = resetUserState;
window.onpagehide = resetUserState;

FlashMessages.configure({
  autoHide: true,
  autoScroll: false
});

Template.main.helpers({
  whichView: function() {
    return Session.get('currentView');
  },
  language: function() {
    return getUserLanguage();
  },
  textDirection: function() {
    return getLanguageDirection();
  }
});

Template.footer.helpers({
  languages: getLanguageList
})

Template.footer.events({
  'click .btn-set-language': function (event) {
    var language = $(event.target).data('language');
    setUserLanguage(language);
    GAnalytics.event("language-actions", "set-language-" + language);
  },
  'change .language-select': function (event) {
    var language = event.target.value;
    setUserLanguage(language);
    GAnalytics.event("language-actions", "set-language-" + language);
  }
})

Template.startMenu.events({
  'click #btn-new-game': function () {
    Session.set("currentView", "createGame");
  },
  'click #btn-join-game': function () {
    Session.set("currentView", "joinGame");
  }
});

Template.startMenu.helpers({
  alternativeURL: function() {
    return Meteor.settings.public.alternative;
  }
});

Template.startMenu.rendered = function () {
  GAnalytics.pageview("/");

  resetUserState();
};

Template.createGame.events({
  'submit #create-game': function (event) {
    GAnalytics.event("game-actions", "newgame");

    var playerName = event.target.playerName.value;

    playerName = playerName.replace(/[^\w\s]/gi, '').trim();

    if (!playerName || Session.get('loading')) {
      return false;
    }

    var game = generateNewGame();
    var player = generateNewPlayer(game, playerName);

    Meteor.subscribe('games', game.accessCode);

    Session.set("loading", true);
    
    Meteor.subscribe('players', game._id, function onReady(){
      Session.set("loading", false);

      Session.set("gameID", game._id);
      Session.set("playerID", player._id);
      Session.set("currentView", "lobby");
    Meteor.subscribe('messages', game._id);
    });

    return false;
  },
  'click .btn-back': function () {
    Session.set("currentView", "startMenu");
    return false;
  }
});

Template.createGame.helpers({
  isLoading: function() {
    return Session.get('loading');
  }
});

Template.createGame.rendered = function (event) {
  $("#player-name").focus();
};

Template.joinGame.events({
  'submit #join-game': function (event) {
    GAnalytics.event("game-actions", "gamejoin");

    var accessCode = event.target.accessCode.value;
    var playerName = event.target.playerName.value;

    playerName = playerName.replace(/[^\w\s]/gi, '').trim();

    if (!playerName || Session.get('loading')) {
      return false;
    }

    accessCode = accessCode.trim();
    accessCode = accessCode.toLowerCase();

    Session.set("loading", true);

    Meteor.subscribe('games', accessCode, function onReady(){
      Session.set("loading", false);

      var game = Games.findOne({
        accessCode: accessCode
      });

      if (game) {
        Meteor.subscribe('players', game._id);
        Meteor.subscribe('messages', game._id);
        player = generateNewPlayer(game, playerName);

        if (game.state === "inProgress") {
          Players.update(player._id, {$set: {role: 'SPECTATOR'}});
        }

        Session.set('urlAccessCode', null);
        Session.set("gameID", game._id);
        Session.set("playerID", player._id);
        Session.set("currentView", "lobby");
      } else {
        FlashMessages.sendError(TAPi18n.__("ui.invalid access code"));
        GAnalytics.event("game-actions", "invalidcode");
      }
    });

    return false;
  },
  'click .btn-back': function () {
    Session.set('urlAccessCode', null);
    Session.set("currentView", "startMenu");
    return false;
  }
});

Template.joinGame.helpers({
  isLoading: function() {
    return Session.get('loading');
  }
});


Template.joinGame.rendered = function (event) {
  resetUserState();

  var urlAccessCode = Session.get('urlAccessCode');

  if (urlAccessCode){
    $("#access-code").val(urlAccessCode);
    $("#access-code").hide();
    $("#player-name").focus();
  } else {
    $("#access-code").focus();
  }
};

Template.lobby.helpers({
  game: function () {
    return getCurrentGame();
  },
  accessLink: function () {
    return getAccessLink();
  },
  player: function () {
    return getCurrentPlayer();
  },
  players: function () {
    var game = getCurrentGame();
    var currentPlayer = getCurrentPlayer();

    if (!game) {
      return null;
    }

    var players = Players.find({'gameID': game._id}, {'sort': {'createdAt': 1}}).fetch();

    players.forEach(function(player){
      if (player._id === currentPlayer._id){
        player.isCurrent = true;
      }
    });

    return players;
  },
  isLoading: function() {
    var game = getCurrentGame();
    return game.state === 'settingUp';
  }
});

Template.lobby.events({
  'click .btn-leave': leaveGame,
  'click .btn-start': function () {
    GAnalytics.event("game-actions", "gamestart");

    var game = getCurrentGame();
    Messages.remove();
    Games.update(game._id, {$set: {state: 'settingUp'}});
  },
  'click .btn-toggle-qrcode': function () {
    $(".qrcode-container").toggle();
  },
  'click .btn-remove-player': function (event) {
    var playerID = $(event.currentTarget).data('player-id');
    Players.remove(playerID);
  },
  'click .btn-edit-player': function (event) {
    var game = getCurrentGame();
    resetUserState();
    Session.set('urlAccessCode', game.accessCode);
    Session.set('currentView', 'joinGame');
  }
});

Template.lobby.rendered = function (event) {
  var url = getAccessLink();
  var qrcodesvg = new Qrcodesvg(url, "qrcode", 250);
  qrcodesvg.draw();
};

function getTimeCooldown(){
  var game = getCurrentGame();
  var localEndTime = game.cooldown - TimeSync.serverOffset();
    var cooldownTime = game.cooldown - Session.get('time');

  if (game.paused){
    var localPausedTime = game.pausedTime - TimeSync.serverOffset();
    var timeRemaining = localEndTime - localPausedTime;
  } else {
    var timeRemaining = localEndTime - Session.get('time');
  }

  if (timeRemaining < 0) {
    timeRemaining = 0;
  }

  return timeRemaining;
}

function getTimeRemaining(){
  var game = getCurrentGame();
  var localEndTime = game.endTime - TimeSync.serverOffset();

  if (game.paused){
    var localPausedTime = game.pausedTime - TimeSync.serverOffset();
    var timeRemaining = localEndTime - localPausedTime;
  } else {
    var timeRemaining = localEndTime - Session.get('time');
  }

  if (timeRemaining < 0) {
    timeRemaining = 0;
  }

  return timeRemaining;
}

Template.gameView.helpers({
  game: getCurrentGame,
  player: getCurrentPlayer,
  players: function () {
    var game = getCurrentGame();
    
    if (!game){
      return null;
    }

    var players = Players.find({
      'gameID': game._id
    });

    return players;
  },
  locations: function () {
    var game = getCurrentGame();
    return game.loccandidates;
  },
  gameFinished: function () {
    var timeRemaining = getTimeRemaining();

    return timeRemaining === 0;
  },

  kicker: function () {
    var cooldownTime =getTimeCooldown();
    if (cooldownTime == 0) return "Ready";
    return moment(cooldownTime).format('mm[<span>:</span>]ss');
  }

  ,
  timeRemaining: function () {
    var timeRemaining = getTimeRemaining();

    return moment(timeRemaining).format('mm[<span>:</span>]ss');
  }
});

function filePost(guy,message,game) {
    Meteor.call("postChat",guy,message,game, function (error, result) {
            });
}

function narratorPost(message,game) {

    filePost("Narrator",message,game);

}
function adminPost(message,game) {
    filePost("ADMN",message,game);
}

function clock() {
    return TimeSync.serverTime(moment()) - TimeSync.serverOffset();
}

  Template.input.events = {
    'keydown input#message' : function (event) {
      if (event.which == 13) { // 13 is the enter key event
        var game = getCurrentGame();
        var name = 'Anonymous';
        var message = document.getElementById('message');

        var currentPlayer = getCurrentPlayer();
<<<<<<< Updated upstream
        if (currentPlayer.kicked && game.state != "waitingForPlayers") return;
      if (currentPlayer.role == "SPECTATOR") {
        return;
      }
=======
        if (currentPlayer.kicked) return;
        if (currentPlayer.role == "SPECTATOR") return;
>>>>>>> Stashed changes
        name = currentPlayer.name;
        if (message.value != '') {
             filePost(name,message.value,game._id);

        if (game.state != "waitingForPlayers") {
          if (message.value.slice(0,5).toUpperCase() == '/KICK' && !currentPlayer.isSpy) {
<<<<<<< Updated upstream
              var cooldownTime = getTimeCooldown();
                  if (cooldownTime > 0) {

                  narratorPost("Kicker still on cooldown.",game._id);
                  return;
                  }
=======
            var cooldownTime = getTimeCooldown();
            if (cooldownTime > 0) return;
>>>>>>> Stashed changes
            var players = Players.find({'gameID': game._id}, {'sort': {'createdAt': 1}}).fetch();

           // Meteor.call("scanKick",game, function (error, result) {});
/*
            players.forEach(function(player) {
             if (player.name.toUpperCase() == message.value.slice(6).toUpperCase()) {
                 if (player.isSpy) {
                  adminPost(player.name.toUpperCase()+" WAS CAUGHT! HUMANS WON THE GAME!",game._id);
                  Players.update(currentPlayer._id, {$inc: {score: 1}});
                  Players.update(player._id, {$inc: {score: -1}});
                  narratorPost("They were at the "+TAPi18n.__(game.location.name),game._id);
                  GAnalytics.event("game-actions", "gameend");
                  Games.update(game._id, {$set: {state: 'waitingForPlayers'}});
                  return;
                 } else {
                  adminPost(currentPlayer.name.toUpperCase()+" KICKED "+player.name.toUpperCase()+" THE "+TAPi18n.__(player.role).toUpperCase()+".",game._id);
                    Players.update(player._id, {$set: {kicked: true}});
                    Players.update(currentPlayer._id, {$inc: {score: -1}});

                    Meteor.call("cooldown",game._id, function (error, result) {
            });


                  return;
                 }
             }
            });
          }

          if (currentPlayer.isSpy) {
            if (message.value.toUpperCase() == TAPi18n.__(game.location.name).toUpperCase()) {
            adminPost(name.toUpperCase()+" THE CHAT BOT WON THE GAME!",game._id);
            Players.update(currentPlayer._id, {$inc: {score:1}});

            GAnalytics.event("game-actions", "gameend");
            var game = getCurrentGame();
            Games.update(game._id, {$set: {state: 'waitingForPlayers'}});

          }
            if (message.value.toUpperCase() !== TAPi18n.__(game.location.name).toUpperCase()) {
          locations.forEach(function(loc) {

                       if (TAPi18n.__(loc.name).toUpperCase() == message.value.toUpperCase()) {
                          adminPost(name.toUpperCase()+" MISFIRED AND LOST! HUMANS WIN!",game._id);
                            Players.update(currentPlayer._id, {$inc: {score: -1}});
                            narratorPost("They were at the "+TAPi18n.__(game.location.name),game._id);
                          GAnalytics.event("game-actions", "gameend");
                          Games.update(game._id, {$set: {state: 'waitingForPlayers'}});
                         return;
                         }
                      });
        }
*/

          }
        }
          //alert(message.value);
         document.getElementById('message').value = '';
         message.value = '';
        }
      }
    }
  }


Template.gameView.events({
  'click .btn-leave': leaveGame,
  'click .btn-end': function () {
    GAnalytics.event("game-actions", "gameend");

    var game = getCurrentGame();
    Games.update(game._id, {$set: {state: 'waitingForPlayers'}});
  },
  'click .btn-toggle-status': function () {
    $(".status-container-content").toggle();
  },
  'click .game-countdown': function () {
    var game = getCurrentGame();
    var currentServerTime = TimeSync.serverTime(moment());

    if(game.paused){
      GAnalytics.event("game-actions", "unpause");
      var newEndTime = game.endTime - game.pausedTime + currentServerTime;
      Games.update(game._id, {$set: {paused: false, pausedTime: null, endTime: newEndTime}});
    } else {
      GAnalytics.event("game-actions", "pause");
      Games.update(game._id, {$set: {paused: true, pausedTime: currentServerTime}});
    }
  },
  'click .player-name': function (event) {
    event.target.className = 'player-name-striked';
  },
  'click .player-name-striked': function(event) {
    event.target.className = 'player-name';
  },
  'click .location-name': function (event) {
    event.target.className = 'location-name-striked';
  },
  'click .location-name-striked': function(event) {
    event.target.className = 'location-name';
  }
});

