function cleanUpGamesAndPlayers(){
  var cutOff = moment().subtract(2, 'hours').toDate().getTime();

  var numGamesRemoved = Games.remove({
    createdAt: {$lt: cutOff}
  });

  var numPlayersRemoved = Players.remove({
    createdAt: {$lt: cutOff}
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
/*
    loccandidates.sort(function(locationA, locationB) {
        return locationA.name > locationB.name;
    });
*/
    var kickcooldown = moment().add(30, 'seconds').valueOf();

    Games.update(id, {$set: {state: 'inProgress', location: location,loccandidates: loccandidates, cooldown: kickcooldown, endTime: gameEndTime, paused: false, pausedTime: null}});
  }
});