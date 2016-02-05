function cleanUpGamesAndPlayers(){
  var cutOff = moment().subtract(2, 'hours').toDate().getTime();

  var numGamesRemoved = Games.remove({
    createdAt: {$lt: cutOff}
  });

  var numPlayersRemoved = Players.remove({
    createdAt: {$lt: cutOff}
  });
}

function narratorMessage(gameid,content) {
  Messages.insert({
    name: "GAME",
    game:gameid,
    message: content,
    time: moment().valueOf(),
  });
}

  Meteor.methods({
        postChat: function (guy,message,game) {
          Messages.insert({
            name: guy,
            game:game,
            message: message,
            time: moment().valueOf(),
          });
        }   ,
        cooldown: function (game) {
            Games.update(game, {$set: {cooldown: moment().add(15, 'seconds').valueOf()}});
        },
        scanKick: function (game,target,caster) {
          Players.update(caster._id, {$set: {
            votingon: target
          }});

          var votes = 0;
          var players = Players.find({gameID: game});
          var cap = 0;
          var list = [];

          players.forEach(function(player, index){
            if (player.votingon != null) list.push(player.votingon);
            cap++;
          });
          cap--;

          Messages.insert({
            name: "GAME",
            game:game,
            message: caster.name+" votes to kick "+target+" / Needs "+cap+" votes to get kicked",
            time: moment().valueOf(),
          });
          narratorMessage(game,caster.name+" votes to kick "+target+" / Needs "+cap+" votes to get kicked");

          var numOfTrue = 0;
          players.forEach(function(player, index){
            numOfTrue = 0;
            for(var i=0;i<list.length;i++){
                if(list[i].toUpperCase() === player.name.toUpperCase()) numOfTrue++;
            }

            Players.update(player._id, {$set: {
              votes: numOfTrue
            }});



            if (numOfTrue >= cap) {
                 if (player.isSpy) {
                  Messages.insert({
                    name: "GAME",game:game,
                    message: player.name.toUpperCase()+" WAS CAUGHT! HUMANS WON THE GAME!",
                    time: moment().valueOf(),
                  });
                  //adminPost(player.name.toUpperCase()+" WAS CAUGHT! HUMANS WON THE GAME!",game._id);
                  Players.update(caster._id, {$inc: {score: 1}});
                  Players.update(player._id, {$inc: {score: -1}});
                  //narratorPost("They were at the "+TAPi18n.__(game.location.name),game._id);
                  //GAnalytics.event("game-actions", "gameend");
                  Games.update(game._id, {$set: {state: 'waitingForPlayers'}});
                  return;
                 } else {
                  Messages.insert({
                    name: "GAME",game:game,
                    message: player.name.toUpperCase()+" THE "+TAPi18n.__(player.role).toUpperCase()+" WAS KICKED.",
                    time: moment().valueOf(),
                  });
                  //adminPost(currentPlayer.name.toUpperCase()+" KICKED "+player.name.toUpperCase()+" THE "+TAPi18n.__(player.role).toUpperCase()+".",game._id);
                    Players.update(player._id, {$set: {kicked: true}});
                    Players.update(caster._id, {$inc: {score: -1}});
                    Games.update(game, {$set: {cooldown: moment().add(15, 'seconds').valueOf()}});
                  return;
                 }
          }

    
          });



        }
    });

function getRandomLocation(){
  var locationIndex = Math.floor(Math.random() * locations.length);
  return locations[locationIndex];
}

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

function assignRoles(players, location){
  var default_role = location.roles[location.roles.length - 1];
  var roles = location.roles.slice();
  var shuffled_roles = shuffleArray(roles);
  var role = null;

  players.forEach(function(player){
    //if (!player.isSpy){
    player.kicked = false;
      role = shuffled_roles.pop();

      if (role === undefined){
        role = default_role;
      }

      Players.update(player._id, {$set: {role: role,kicked : false}});
   // }
  });
}

Meteor.startup(function () {
  // Delete all games and players at startup
  Games.remove({});
  Players.remove({});
  Messages.remove({});
});

var MyCron = new Cron(60000);

MyCron.addJob(5, cleanUpGamesAndPlayers);

Meteor.publish('games', function(accessCode) {
  return Games.find({"accessCode": accessCode});
});

Meteor.publish('messages', function(gameID) {
  return Messages.find({"game": gameID}, { sort: { time: -1}});
});

Meteor.publish('players', function(gameID) {
  return Players.find({"gameID": gameID});
});


Games.find({"state": 'waitingForPlayers'}).observeChanges({
  added: function (id, game) {
    Games.update(id, {$set: {location: null}});
  }
});


Games.find({"state": 'settingUp'}).observeChanges({
  added: function (id, game) {
    if (game.location != null) return;
    var location = getRandomLocation();
    Games.update(id, {$set: {location: location}});
    var players = Players.find({gameID: id});
    var gameEndTime = moment().add((players.count() + 2), 'minutes').valueOf();

    var spyIndex = Math.floor(Math.random() * players.count());
    var firstPlayerIndex = Math.floor(Math.random() * players.count());

    Messages.remove({"game": id});

    players.forEach(function(player, index){
      Players.update(player._id, {$set: {
        votes: 0,
        votingon: null,
        isSpy: index === spyIndex,
        isFirstPlayer: index === firstPlayerIndex
      }});
    });

    assignRoles(players, location);

    var shuffled_locs = shuffleArray(locations);
    var loccandidates = [location];
    shuffled_locs.forEach(function(loc){
        loc.localname = TAPi18n.__(loc.name);
        if (location != loc && loccandidates.length < 20) loccandidates.push(loc);
    });
    loccandidates = shuffleArray(loccandidates);


    loccandidates = _.sortBy(loccandidates, function(image){ return image.localname; });
    
    var kickcooldown = moment().add(30, 'seconds').valueOf();

    Games.update(id, {$set: {state: 'inProgress', location: location,loccandidates: loccandidates, cooldown: kickcooldown, endTime: gameEndTime, paused: false, pausedTime: null}});
  }
});