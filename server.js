var config = require('./config');
var fs = require('fs');
var server = require('http').createServer();
var io = require('socket.io')(server); //SITE init start
var crypto = require('crypto');
var request = require('request');
var requestify = require('requestify');
var mysql = require('mysql');
var sha256 = require('sha256');
var math = require('mathjs');

const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
	steam: client,
	community: community,
	language: 'en'
});

const shared_secret = ""; // SHARED_SECRET, pegue no .maFile
const identity_secret = ""; // INDENTITY_SECRET, pegue no .maFile

const logInOptions = {
	accountName: '', // USER DA CONTA STEAM
	password: '', // SERNHA DA CONTA STEAM
	twoFactorCode: SteamTotp.generateAuthCode(shared_secret)
};

client.logOn(logInOptions);

client.on('loggedOn', () => {
  console.log('logged on');
  client.gamesPlayed('Gambling Developer!!! Discord: Hachiman#9053');
  client.setPersona(SteamUser.EPersonaState.Online);
});

if (fs.existsSync('polldata.json')) {
	manager.pollData = JSON.parse(fs.readFileSync('polldata.json').toString('utf8'));
}

var randomstring = require("randomstring");
var connection = mysql.createConnection({
    host: config.host,
	port: config.port,
    user: config.user,
    password: config.password,
    database: config.db
}); //SITE init end

var log4js = require('log4js');
const log4js_extend = require("log4js-extend");
log4js.configure({
	appenders: {
		out: { type: 'console' },
		task: {
			type: 'dateFile',
            filename: 'logs/bot',
			pattern: '-yyyy-MM-dd.log',
			alwaysIncludePattern: true
		}
	},
	categories: {
		default: { appenders: [ 'out', 'task' ], level: 'all' }
	}
});
log4js_extend(log4js, {
  path: __dirname,
  format: "(@file:@line:@column)"
});
var logger = log4js.getLogger();
//BOT init stop

//SITE SETTINGS
var prices;
var users = {};
var chat_muted = false;
var isSteamRIP = false;
var pause = false;
var lastrolls = [];
var last_message = {};
var usersBr = {};
var chat_history = [];
var currentBets = {
    'red': [],
    'green': [],
    'black': []
};
var accept = 100;
var wait = 50;
var timer = -100;
var currentRollid = 0;
var winningNumber = 0;
var actual_hash = "";
var secret;
var active = {
    roulette: true,
    jackpot: true,
    coinflip: true,
	dice: true,
	mines: true,
    crash: true,
    withdraw: true,
    deposit: true,
};

var reservedrefcodes = fs.readFileSync(__dirname + '/reservedcodes.txt').toString().split("\r\n") || [];

//COINFLIP
var cfBets = [];
var betUsers = {};

//JACKPOT
var jpTime = 20; //POOL TIMELEFT YOU WANT IN SECONDS

var jpPool = 0;
var jpTimeleft = -1;
var jpAllow = true;
var jpBets = [];
var jpWinners = [];
var jpUsers = {};

//CRASH
var cstart_in = config.crash_time;
var ccurrenthash = 'dog';
var ccrashpoint = 0;
var ctime = 0;
var cgame = 0;
var csecret = '';
var cbets = [];
var players_cashouts = {};
var cgame_history = [];
var cstatus = 'closed';
var play_try = {};
var startTime;
var cdrop;

const BitSkins = require('bitskins-api');
const bitskins = new BitSkins('3874d4a7-7ec8-487c-8c47-0f1afb7a90d5', 'GKFA2I7NVIU3CHNO');

var allPrices = [];

var getPrices = function() {
	bitskins.getAllItemPrices().then((data) => {
		if(data.status == "success") {
		fs.writeFile('prices.json', JSON.stringify(data), 'utf8', function() {
			console.log('Prices upgrade');
			for(let i = 0; i < data.prices; i++) {
			allPrices = [];
			allPrices[data.prices[i].market_hash_name] = data.prices[i];
			if(i == data.prices.length) started = true;
			}
		}); // Print the json response
		}
	}).catch((err) => console.log());
}

setTimeout(function() {

	getPrices();

	setInterval(function() {
		getPrices();
	}, 86400 * 1000);
}, 86400 * 1000);

var started = false;

var prices = JSON.parse(fs.readFileSync('prices.json')).prices;
for(let i = 0; i < prices.length; i++) {

	allPrices[prices[i].market_hash_name] = prices[i];
	if(i <= prices.length) started = true;
}

console.log(started);
//DICE
var user_dice_current = {};
var dice_games = [];

//MINES

var user_mines_current = {};
var mines_games = {};
//}

//NEW LOGIN
var user_login_codes = {};


function crashPoint(serverSeed) {
    var hash = crypto.createHmac('sha256', serverSeed).digest('hex');

    // In 1 of 25 games the game crashes instantly.
    if (divisible(hash, 10))
        return 0;

    // Use the most significant 52-bit from the hash to calculate the crash point
    var h = parseInt(hash.slice(0, 52 / 4), 16);
    var e = Math.pow(2, 52);

    return Math.floor((100 * e - h) / (e - h));
}

function divisible(hash, mod) {
    // We will read in 4 hex at a time, but the first chunk might be a bit smaller
    // So ABCDEFGHIJ should be chunked like  AB CDEF GHIJ
    var val = 0;

    var o = hash.length % 4;
    for (var i = o > 0 ? o - 4 : 0; i < hash.length; i += 4) {
        val = ((val << 16) + parseInt(hash.substring(i, i + 4), 16)) % mod;
    }

    return val === 0;
}

function cstart_game() {
    ctime = 0;
	cdrop = crashPoint(generate(20));
	csecret = generate(20);
	ccurrenthash = sha256(cdrop + ":" + csecret);
    ccrashpoint = 0;
    cstart_in = config.crash_time;
    cbets = [];
    players_cashouts = {};
    cstatus = 'open';
    io.sockets.to('crash').emit('crash info', {
        hash: ccurrenthash,
        players: cbets,
        start_in: parseFloat(cstart_in)
    });
    var cstart_timeout = setInterval(function() {
        cstart_in = (cstart_in - 0.01).toFixed(3);
        if (cstart_in < 0.00) {
            clearInterval(cstart_timeout);
            cnew_game();
        }
    }, 10);
}

function cnew_game() {
    ctime = Date.now();
    cgame++;
    cstatus = 'closed';
    logger.log("[CRASH] " + cgame + ": " + (cdrop / 100) + "" + " (DEBUG: " + cdrop + ")");
    startTime = new Date(Date.now() + 5000);
    io.sockets.to('crash').emit('crash start', {
        multiplier: 1,
        time: ctime,
    });
    var cgame_timeout = setInterval(function() {
        //   ctime++;
        ccrashpoint = Math.floor(100 * growthFunc(ctime));
        doCashouts(ccrashpoint / 100);
        if (ccrashpoint >= cdrop) {
            cstatus = 'drop';
            clearInterval(cgame_timeout);
            clearInterval(cshowgame_timeout);
            cmultiplier = growthFunc(ctime);
            io.sockets.to('crash').emit('crash end', {
                bet: 0,
                hash: ccurrenthash,
                multiplier: cmultiplier,
                profit: 0,
                secret: csecret
            });
            crash_limit({
                bet: 0,
                hash: ccurrenthash,
                multiplier: cmultiplier,
                profit: 0,
                secret: csecret,
                time: new Date().getTime()
            });
            setTimeout(function() {
                cstart_game();
            }, 5000);
        }
    });
    var cshowgame_timeout = setInterval(function() {
        io.emit('crash tick', {
            multiplier: growthFunc(ctime)
        });
    }, 40);
}

function crash_limit(wartosc) {
    if (cgame_history.length == 15) {
        cgame_history.shift();
    }
    cgame_history.push(wartosc);
}

function growthFunc(ms) {
    var r = 0.00006;
    var time = Date.now() - ms;
    return Math.pow(Math.E, r * time);
}

function doCashouts(at) {
    cbets.forEach(function(play) {
        if ((play.done) || (!players_cashouts[play.profile.steamid])) return;
        if (players_cashouts[play.profile.steamid] <= at && players_cashouts[play.profile.steamid] <= growthFunc(ctime)) {
            crashWithdraw({
                steamid: play.profile.steamid
            });
        }
    });
}

cstart_game();
connection.connect();
load();
checkTimer();
/*                                                                                                                                                              */
/*                                                                                SITE PART                                                                     */
/*                                                                                                                                                              */

client.on('webSession', function(sessionID, cookies) {
	manager.setCookies(cookies, function(err) {
	});
});

manager.on('sentOfferChanged', function(offer, oldState) {
	connection.query('SELECT * FROM `trade_history` WHERE `offer_id` = ' + offer.id, function(err, rows) {
		if (err) {
			logger.debug('IMPORTANT ERROR AT SENT OFFER CHANGED EVENT');
			logger.debug(err);
			return;
		} else if (rows.length < 1) {
			return;
		} else {
			connection.query('UPDATE `trade_history` SET `offer_state` = ' + offer.state + ' WHERE `offer_id` = ' + offer.id, function(error) {
				if (error) {
					logger.debug('IMPORTANT ERROR AT SENT OFFER CHANGED EVENT');
					logger.debug(error);
					return;
				} else {;
					if(offer.state == 3) {
						if (rows[0].action == 'deposit') {
							var items = offer.itemsToReceive;
							items.forEach(function(item) {
								console.log(item.icon_url, item.market_hash_name, item.assetid, item.name_color, "1", "0", (parseFloat(allPrices[item.market_hash_name].price)*100));
								connection.query('INSERT INTO inventory(img, name, classid, color, bot_id, in_trade, price) VALUES("' + item.icon_url + '", "'+ item.market_hash_name +'", "' + item.assetid + '", "'+ item.name_color +'", "1", "0", ' + (allPrices[item.market_hash_name].price * 100) + ')', function(err, body) {
									if (err) {
										logger.debug('FUCKING IMPORTANT ERROR OCCURED ON ITEM ID: ' + item.id + " (" + item.name + ")");
										logger.debug(err);
									}
								});
							});
							connection.query('UPDATE `users` SET `deposit_sum` = `deposit_sum` + ' + rows[0].worth / 1.1 + ', `wallet` = `wallet` + ' + rows[0].worth + ' WHERE `steamid` = ' + connection.escape(rows[0].offer_partner), function(error1) {
								if (error1) {
									logger.error('IMPORTANT ERROR AT SENT OFFER CHANGED EVENT, user:' + offer.partner);
									logger.debug(error1);
									return;
								} else {
									connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(rows[0].offer_partner) + ', `change` = ' + connection.escape(rows[0].worth) + ', `reason` = \'Deposit\'', function(err2) {
										if (err2) {
											logger.error('database error at wallet_change');
											logger.debug(err2);
										}
									});
									if (users[offer.partner]) {
										users[offer.partner].socket.forEach(function(asocket) {
											if (io.sockets.connected[asocket]) {
												io.sockets.connected[asocket].emit('notify', 'success', 'depositOfferAccepted', [offer.id, rows[0].worth]);
												io.sockets.connected[asocket].emit('balance change', rows[0].worth);
											}
										});
									}
								}
							});
						} else if (rows[0].action == 'withdraw') {
							var items = offer.sender.items;
							items.forEach(function(item) {
								connection.query('DELETE FROM `inventory` WHERE `classid` = ' + item.id, function(errorAeh) {
									if (errorAeh) {
										logger.error('error while deleting items on item ID: ' + item.id + " (" + item.name + ")");
										logger.debug(errorAeh);
									}
								});
							});
							if (users[offer.partner]) {
								users[offer.partner].socket.forEach(function(asocket) {
									if (io.sockets.connected[asocket]) {
										io.sockets.connected[asocket].emit('notify', 'success', 'withdrawOfferAccepted', [offer.id]);
									}
								});
							}
						}
					} else if(offer.state != 2) {
						if (rows[0].action == 'withdraw') {
							var items = offer.itemsToReceive;
							items.forEach(function(item) {
								connection.query('UPDATE `inventory` SET `in_trade` = \'0\'' + ' WHERE `classid` = ' + connection.escape(item.id), function(err6) {
									if (err6) {
										logger.error('error at updating in trade items status. id:' + item.id);
										logger.debug(err6);
									}
								});
							});
							connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + parseInt(rows[0].worth) + ',`withdraw_sum` = `withdraw_sum` - ' + parseInt(rows[0].worth) + ' WHERE `steamid` = ' + connection.escape(rows[0].offer_partner), function(err7) {
								if (err7) {
									logger.error('IMPORTANT error at updating in trade items status. steamid:' + offer.partner);
									logger.debug(err7);
								}
							});
							if (users[offer.partner]) {
								users[offer.partner].socket.forEach(function(asocket) {
									if (io.sockets.connected[asocket]) {
										io.sockets.connected[asocket].emit('balance change', rows[0].worth);
									}
								});
							}
						}
					}
				}
			});

		}
	});
});

io.on('connection', function(socket) {
    var user = false;
    socket.on('init', function(init) {
        if (!init) return;
        if (init.game === 'roulette') socket.join('roulette');
        if (init.game === 'roulette') socket.emit('roulette round', timer / 10, currentBets, actual_hash, pause ? winningNumber : null);
        if (init.game === 'roulette') socket.emit('roulette history', lastrolls);
        if (init.game === 'coinflip') socket.join('coinflip');
        if (init.game === 'coinflip') socket.emit('coinflip history', cfBets);
        if (init.game === 'jackpot') socket.join('jackpot');
        if (init.game === 'jackpot') socket.emit('jackpot round', jpTimeleft, jpBets, jpWinners);
        if (init.game === 'crash') socket.join('crash');
        if (init.game === 'crash') socket.emit('crash info', {
            hash: ccurrenthash,
            players: cbets,
            start_in: cstart_in
        });
        if (init.game === 'crash') socket.emit('crash history', cgame_history);
        if (init.game === 'crash') socket.emit('crash settings', {
            maxBet: config.max_crash_bet,
            minBet: config.min_crash_bet
        });
        if (init.game === 'crash' && cstatus == 'closed') socket.emit('crash start', {
            multiplier: growthFunc(ctime),
            time: ctime,
        });
        if (init.game === 'crash' && init.logged) {
            var find = cbets.find(x => x.profile.steamid == init.steamid);
            if (find) {
                socket.emit('crash my bet', parseInt(find.bet));
            }
        }
        if (init.game === 'dice') socket.join('dice');
		if (init.game === 'dice') socket.emit('dice-history', dice_games.filter(function(game){return game.user != null;}))
        socket.emit('users online', Object.keys(users).length);
        socket.emit('chat', chat_history);
        socket.emit('connected');
		if (init.logged) {
			connection.query('SELECT * FROM `users` WHERE `steamid`=' + connection.escape(init.steamid) + ' AND `token_time`=' + connection.escape(init.time) + ' AND `token`=' + connection.escape(init.token) + ' LIMIT 1', function(err, rows) {
				if ((err) || (!rows.length)) {
					console.log(err);
					socket.disconnect();
					logger.debug('auth failed.');
					return;
				} else if (rows) {
					if (init.game === 'dice') socket.emit('dice-hash', {
						"hash": generateDiceGame(init.steamid)
					});
					if (rows[0].logged_in) return;
					if (rows[0].banned) return;
					connection.query('UPDATE `users` SET `logged_in` = 1 WHERE `steamid`=' + connection.escape(init.steamid) + ' AND `token_time`=' + connection.escape(init.time) + ' AND `token`=' + connection.escape(init.token) + ' LIMIT 1', function(err1, rows1) {
						if (err1) return logger.error(err1);
						user = rows[0];
						if (!users[rows[0].steamid]) {
							users[rows[0].steamid] = user;
							users[rows[0].steamid].socket = [];
						}
						users[rows[0].steamid]['socket'].push(socket.id);
					});
				} else {
					return;
				}
			});
		}
	});
	socket.on('disconnect', function() {
		var index = -1;
		if (users[user.steamid])
			index = users[user.steamid]['socket'].indexOf(socket.id);
		if (index > -1) {
			users[user.steamid]['socket'].splice(index, 1);
		}
		if (users[user.steamid]) {
			if (Object.keys(users[user.steamid]['socket']).length == 0) delete users[user.steamid];
		}
		connection.query('UPDATE `users` SET `logged_in` = 0 WHERE `steamid`=' + connection.escape(user.steamid) + ' LIMIT 1', function(err1, rows1) {
			if (err1) return;
		});
	});
	socket.on('trade token', function(token) {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!token) return socket.emit('notify', 'error', 'tradeTokenFailed');
		if (typeof token != 'string') return socket.emit('notify', 'error', 'tradeTokenFailed');
		connection.query('UPDATE `users` SET `tradeurl` = ' + connection.escape(token) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err, row) {
			if (err) {
				socket.emit('notify', 'error', 'tradeTokenFailed');
				logger.debug(err);
				return;
			}
			var n_token = token.split('/');
			socket.emit('notify', 'success', 'tradeTokenSuccess', [n_token[5]]);
		});
	});
	socket.on('request inventory', function(force) {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!force) var force = false;
		if (typeof force != 'boolean') var force = false;
		if ((fs.existsSync('cache/' + user.steamid + '.txt')) && (force == false)) {
			var inventory = JSON.parse(fs.readFileSync('cache/' + user.steamid + '.txt'));
			socket.emit('inventory', {
				inventory: inventory.inventory,
				prices: inventory.prices
			});
			socket.emit('notify', '', 'loadInventoryCached');
		} else {
			manager.getUserInventoryContents(user.steamid, 730, 2, true, function(err, items) {
				if(err) {
					console.log('Error getting their inventory: ' + err);
				} else {
					var output_prices = [];
					
					items.forEach(function(item) {
						item.price = allPrices[item.market_hash_name].price * 100;
						if(allPrices[item.market_hash_name].price * 100 >= config.min_deposit) {
							output_prices.push({
								name: item.name,
								price: allPrices[item.market_hash_name].price * 100
							});
						}
					});
					fs.writeFile('cache/' + user.steamid + '.txt', JSON.stringify({
						inventory: items,
						prices: output_prices
					}), function(fserr) {
						if (fserr) {
							socket.emit('notify', 'error', 'loadSiteInventoryError');
							return logger.debug(fserr);
						}
					});
					socket.emit('inventory', {
						inventory: items,
						prices: output_prices
					});
					socket.emit('notify', 'success', 'loadInventorySuccess');
				}
			});
		}
	});
	socket.on('update ref', function(code) {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if(code.length < 4) return socket.emit('notify', 'error', 'updateRefFailShort', [4]);
		if(code.length > 20) return socket.emit('notify', 'error', 'updateRefFailLong', [20]);
		if(reservedrefcodes.indexOf(code) != -1) return socket.emit('notify', 'error', 'reservedRefCode');
		connection.query('SELECT `code` FROM `users` WHERE `code` = ' + connection.escape(code.toUpperCase()) + ' LIMIT 1', function(codes_error, codes) {
			if (codes_error) {
				logger.error('failed to check for code');
				socket.emit('notify', 'error', 'updateRefFail');
			} else {
				if (codes.length > 0) {
					socket.emit('notify', 'error', 'updateRefAlreadyTaken');
				} else {
					connection.query('UPDATE `users` SET `code` = ' + connection.escape(code.toUpperCase()) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(codes_update_error) {
						if (codes_update_error) {
							logger.error(codes_update_error);
							return socket.emit('notify', 'error', 'updateRefFail');
						} else {
							socket.emit('notify', 'success', 'updateRefSuccess');
						}
					});
				}
			}
		});
	});
	socket.on('deposit items', function(deposited) {
		logger.debug(deposited);
		let items = deposited.items;
		let totalPrice = deposited.value;
		if (!active["deposit"]) return [socket.emit('notify', 'error', 'closed'), socket.emit('deposit error')];
		if (!user) return [socket.emit('notify', 'error', 'notLoggedIn'), socket.emit('deposit error')];
		if (items.length < 1) return [socket.emit('notify', 'error', 'depositNoItemsRequested'), socket.emit('deposit error')];
		if (Object.prototype.toString.call(items) !== '[object Array]') return [socket.emit('notify', 'error', 'depositNoItemsRequested'), socket.emit('deposit error')];
		if ((new Set(items)).size !== items.length) return [socket.emit('notify', 'error', 'depositDuplicate'), socket.emit('deposit error')]
		if (user.deposit_ban) return [socket.emit('notify', 'error', 'depositBanned'), socket.emit('deposit error')];
		connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				logger.debug(err);
				socket.emit('notify', 'error', 'serverError');
				socket.emit('deposit error');
				return;
			}
			if (row[0].tradeurl.length < 3) return [socket.emit('notify', 'error', 'noTradeToken'), socket.emit('deposit error')];
			else if (row[0].deposit_ban == 1) return [socket.emit('notify', 'error', 'depositBanned'), socket.emit('deposit error')];
			else {
				connection.query('SELECT * FROM `trade_history` WHERE `offer_partner` = ' + connection.escape(user.steamid) + ' AND (`offer_state` = \'sent\' OR `offer_state` = \'pending\' OR `offer_state` = \'2\' OR `offer_state` = \'9\')', function(offer_err, offers) {
					if (offer_err) {
						logger.debug(offer_err);
						socket.emit('notify', 'error', 'serverError');
						socket.emit('deposit error');
						return;
					} else if (offers.length > 0) {
						socket.emit('notify', 'error', 'pendingOffer');
						socket.emit('deposit error');
						return;
					} else {
						let offer = manager.createOffer(user.tradeurl);
						let offerItems = [];
						items.forEach(function(item) {
							offerItems.push({
								appid: 730,
								contextid: 2,
								assetid: item
							});
						});
						offer.addTheirItems(offerItems);
						offer.setMessage("Test deposit items!");
						offer.send(function(err, status) {
							if (err) {
								console.log('test');
								console.log(err);
								return;
							}
							console.log(status);
							if (status == 'pending') {
								// We need to confirm it
								console.log('CONFIRM THIS ');
								console.log(`Offer #${offer.id} sent, but requires confirmation`);
								community.acceptConfirmationForObject(identity_secret, offer.id, function(err) {
									if (err) {
										console.log(err);
									}
								});
							} else {
								console.log(`Offer #${offer.id} sent successfully`);
								logger.info('Deposit request, items: ' + items);
								connection.query('INSERT INTO trade_history (offer_id, offer_partner, offer_state, worth, action) VALUES("'+ offer.id +'", ' + user.steamid + ', "pending", ' + totalPrice + ', "deposit")', function(err1) {
									if (err1) {
										logger.error('error occured while deposit');
										logger.debug(err1);
										socket.emit('notify', 'error', 'depositFailed');
										socket.emit('deposit error');
										return;
									} else {
										socket.emit('notify', 'success', 'depositOfferSent', [offer.id]);
									}
								});
							}
						});
					}
				});
			}
		});
	});
	socket.on('withdraw items', function(items) {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (items != null && items.length < 1) return [socket.emit('notify', 'error', 'withdrawNoItemsRequested'), socket.emit('withdraw error')];
		if (Object.prototype.toString.call(items) !== '[object Array]') return [socket.emit('notify', 'error', 'withdrawNoItemsRequested'), socket.emit('withdraw error')];
		if ((new Set(items)).size !== items.length) return [socket.emit('notify', 'error', 'withdrawDuplicate'), socket.emit('withdraw error')]
		if (user.withdraw_ban) return [socket.emit('notify', 'error', 'withdrawSuspected'), socket.emit('withdraw error')];
		connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				logger.debug(err);
				socket.emit('notify', 'error', 'serverError');
				socket.emit('withdraw error');
				return;
			}
			if (row[0].tradeurl.length < 3) return [socket.emit('notify', 'error', 'noTradeToken'), socket.emit('withdraw error')];
			else {
				connection.query('SELECT * FROM `trade_history` WHERE `offer_partner` = ' + connection.escape(user.steamid) + ' AND (`offer_state` = \'sent\' OR `offer_state` = \'pending\' OR `offer_state` = \'2\')', function(offer_err, offers) {
					if (offer_err) {
						logger.debug(offer_err);
						socket.emit('notify', 'error', 'serverError');
						socket.emit('withdraw error');
						return;
					} else if (offers.length > 0) {
						socket.emit('notify', 'error', 'pendingOffer');
						socket.emit('withdraw error');
						return;
					} else {
						var totalprice = 0;
						connection.query('SELECT * FROM `inventory` WHERE `in_trade` = \'0\'', function(inv_err, my_inv) {
							if (inv_err) {
								logger.debug('error occured while withdraw');
								logger.debug(inv_err);
								socket.emit('notify', 'error', 'withdrawFailed');
								socket.emit('withdraw error');
								return;
							} else {
								my_inv.forEach(function(item) {
									items.forEach(function(itm) {
										if(item.id == itm) {
											totalprice += item.price;
											console.log(totalprice);
										}
									});
								});
								var problem = false;
								var more_bots = false;

								if (more_bots) return [socket.emit('notify', 'error', 'withdrawMultipleBots'), socket.emit('withdraw error')];
								if (!problem) {
								var deltaDeposit = row[0].deposit_sum - row[0].withdraw_sum;

								if (row[0].wallet < totalprice) {
									socket.emit('notify', 'error', 'notEnoughCoins');
									socket.emit('withdraw error');
								}
								else if (row[0].wager < totalprice) {
									socket.emit('notify', 'error', 'withdrawNotEnoughWagered');
									socket.emit('withdraw error');
								} else if (row[0].deposit_sum < 2500) {
									socket.emit('notify', 'error', 'withdrawNotEnoughDeposit', [row[0].deposit_sum]);
									socket.emit('withdraw error');
								} else if (row[0].total_bet < totalprice*0.75) {
									socket.emit('notify', 'error', 'withdrawWagerNeed', [Math.round(totalprice*0.75 - row[0].total_bet)]);
									socket.emit('withdraw error');
								} else if (row[0].wallet >= 100000 && row[0].withdraw_approved == 0 && user.rank != "root") {
									socket.emit('notify', 'error', 'withdrawSuspected');
									socket.emit('withdraw error');
								} else if (!active["withdraw"]) {
									logger.debug("5");
									socket.emit('notify', 'error', 'Unkown error, please contact an admin.');
									socket.emit('withdraw error');
								} else {
									connection.query('SELECT `wallet`,`wager` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(wallet_err, balance) {
										if (wallet_err) {
											logger.debug('error occured while withdraw');
											logger.debug(wallet_err);
											socket.emit('notify', 'error', 'withdrawFailed');
											socket.emit('withdraw error');
											return;
										} else {
											
											if (balance[0].wallet >= totalprice) {
												if (!my_inv[0]) return;
												
												connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + parseInt(totalprice) + ',`withdraw_sum` = `withdraw_sum` + ' + parseInt(totalprice / 0.9) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err3) {
													if (err3) {
														logger.error('error occured while withdraw, balance change, user: ' + user.steamid);
														logger.debug(err3);
														socket.emit('notify', 'error', 'notEnoughCoins');
														socket.emit('withdraw error');
														return;
													} else {
														items.forEach(function(update_item) {
															connection.query('UPDATE `inventory` SET `in_trade` = \'1\'' + ' WHERE `classid` = ' + connection.escape(update_item), function(err6) {
																if (err6) {
																	logger.error('error at updating in trade items status. id:' + update_item);
																	logger.debug(err6);
																}
															});
														});
														let offer = manager.createOffer(user.tradeurl);
														let offerItems = [];
														items.forEach(function(item) {
															offerItems.push({
																appid: 730,
																contextid: 2,
																assetid: item
															});
														});
														offer.addMyItems(offerItems);
														offer.setMessage("Test withdraw items!");
														offer.send(function(err, status) {
															if (err) {
																console.log(err);
																items.forEach(function(update_item) {
																	connection.query('UPDATE `inventory` SET `in_trade` = \'0\'' + ' WHERE `id` = ' + connection.escape(update_item), function(err9) {
																		if (err9) {
																			logger.error('error at updating in trade items status. id:' + update_item);
																			logger.debug(err9);
																		}
																	});
																});
																connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + parseInt(totalprice) + ',`wager` = `wager` + ' + parseInt(totalprice) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err4) {
																	if (err4) {
																		logger.error('FUCK ERROR WHILE RETURNING BALANCE, error occured while withdraw, user: ' + user.steamid);
																		logger.debug(err4);
																	}
																});
																logger.debug('error occured while withdraw, user: ' + user.steamid);
																socket.emit('notify', 'error', 'withdrawFailed');
																socket.emit('withdraw error');
																return;
															}
															console.log(status);
															if (status == 'pending') {
																// We need to confirm it
																console.log('CONFIRM THIS ');
																console.log(`Offer #${offer.id} sent, but requires confirmation`);
																community.acceptConfirmationForObject("FiCREYNRmu+vV5dDJ/QtAEg3Pdc=", offer.id, function(err) {
																	if (err) {
																		console.log(err);
																	}
																});
															} else {
																console.log(`Offer #${offer.id} sent successfully`);
																var offer = body.response.offer;
																logger.debug('Withdraw request, items: ' + items);
																connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = ' + connection.escape('-' + totalprice) + ', `reason` = \'Withdraw\'', function(err_wallet_hist) {
																	if (err_wallet_hist) {
																		logger.debug('database error at wallet_change');
																		logger.debug(err_wallet_hist);
																	}
																});
																connection.query('INSERT INTO `trade_history` SET `offer_id`=' + connection.escape(offer.id) + ',`offer_partner`=' + connection.escape(user.steamid) + ',`offer_state`=' + connection.escape(offer.state) + ',`worth`=' + totalprice + ',`action`=\'withdraw\'', function(err1) {
																	if (err1) {
																		connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + parseInt(totalprice) + ',`wager` = `wager` + ' + parseInt(totalprice) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err5) {
																			if (err5) {
																				logger.debug('error occured while withdraw, user: ' + user.steamid);
																				logger.debug(err5);
																			}
																		});
																		logger.debug('error occured while withdraw, user: ' + user.steamid);
																		logger.debug(err1);
																		socket.emit('notify', 'error', 'withdrawFailed');
																		socket.emit('withdraw error');
																		return;
																	} else {
																		if (users[user.steamid]){
																			users[user.steamid].socket.forEach(function(asocket) {
																				if (io.sockets.connected[asocket])
																					io.sockets.connected[asocket].emit('balance change', parseInt('-' + totalprice));
																				if (io.sockets.connected[asocket])
																					io.sockets.connected[asocket].emit('notify', 'success', 'withdrawOfferSent', [offer.id]);
																			});
																		}
																	}
																});
															}
														});
													}
												});
											} else {
												socket.emit('notify', 'error', 'notEnoughCoins');
												socket.emit('withdraw error');
											}
										}
									});
								}
								} else {
									socket.emit('notify', 'error', 'withdrawFailed');
									socket.emit('withdraw error');
									return;
								}
							}
						});
					}
				});
			}
		});
	});
	socket.on('roulette play', function(play, color) {
		if (!active["roulette"]) return socket.emit('notify', 'error', 'closed');
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if ((!play) || (!color)) return socket.emit('notify', 'error', 'roulettePlayFailed');
		if ((typeof play != 'string') && (typeof play != 'number')) return socket.emit('notify', 'error', 'roulettePlayFailed');
		if (typeof color != 'string') return socket.emit('notify', 'error', 'roulettePlayFailed');
		if ((usersBr[user.steamid] !== undefined) && (usersBr[user.steamid] == config.max_roulette_bets)) {
			socket.emit('notify', 'error', 'rouletteMaxBets', [config.max_roulette_bets]);
			return;
		}
		play = parseInt(play);
		if (isNaN(play)) return socket.emit('notify', 'error', 'cannotParseValue');
		play = '' + play;
		play = play.replace(/\D/g, '');
		if (color !== 'green' && color !== 'red' && color !== 'black') return socket.emit('notify', 'error', 'rouletteUnknownColor');
		if (play < 1) return socket.emit('notify', 'error', 'rouletteMinBet', [play, 1]);
		if (play > config.max_roulette_bet) return socket.emit('notify', 'error', 'rouletteMaxBet', [play, config.max_roulette_bet]);
		if (!pause) {
			connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
				if ((err) || (!row.length)) {
					logger.debug(err);
					socket.emit('notify', 'error', 'roulettePlayFailed');
					return;
				}
				if (row[0].wallet >= play) {
					connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + parseInt(play) + ', `total_bet` = `total_bet` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err2, row2) {
						if (err2) {
							logger.debug(err2);
							socket.emit('notify', 'error', 'roulettePlayFailed');
							return;
						}
						if (row[0].deposit_sum >= config.min_bet_wager) {
							connection.query('UPDATE `users` SET `wager` = `wager` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid));
						}
						connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = -' + connection.escape(play) + ', `reason` = \'Roulette #' + currentRollid + ' ' + color + '\'', function(err3, row3) {
							if (err3) {
								logger.debug('important error at wallet_change');
								logger.debug(err3);
								socket.emit('notify', 'error', 'serverError');
								return;
							}
							if (usersBr[user.steamid] === undefined) {
								usersBr[user.steamid] = 1;
							} else {
								usersBr[user.steamid]++;
							}
							io.sockets.to('roulette').emit('roulette player', {
								amount: play,
								player: {
									avatar: user.avatar,
									steamid: user.steamid,
									username: user.username
								}
							}, color);
							currentBets[color].push({
								amount: play,
								player: {
									avatar: user.avatar,
									steamid: user.steamid,
									username: user.username
								}
							});
							if (users[user.steamid])
								users[user.steamid].socket.forEach(function(asocket) {
									if (io.sockets.connected[asocket])
										io.sockets.connected[asocket].emit('balance change', parseInt('-' + play));
									if (io.sockets.connected[asocket])
										io.sockets.connected[asocket].emit('notify', 'success', 'roulettePlaySuccess', [play, color, usersBr[user.steamid], config.max_roulette_bets]);
								});
						});
					});
				} else {
					socket.emit('notify', 'error', 'notEnoughCoins');
				}
			});
		} else
			socket.emit('notify', 'error', 'roulettePlayFailed');
	});
	socket.on('coinflip play', function(play, color) {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if ((!play) || (!color)) return socket.emit('notify', 'error', 'coinflipPlayFailed');
		if ((typeof play != 'string') && (typeof play != 'number')) return socket.emit('notify', 'error', 'coinflipPlayFailed');
		if (typeof color != 'string') return socket.emit('notify', 'error', 'coinflipPlayFailed');
		play = parseInt(play);
		if (isNaN(play)) return socket.emit('notify', 'error', 'cannotParseValue');
		play = '' + play;
		play = play.replace(/\D/g, '');
		if (color !== 'ct' && color !== 't') return socket.emit('notify', 'error', 'coinflipUnknownColor');
		if (play < config.min_coinflip_bet) return socket.emit('notify', 'error', 'coinflipMinBet', [play, config.min_coinflip_bet]);
		if (play > config.max_coinflip_bet) return socket.emit('notify', 'error', 'coinflipMaxBet', [play, config.max_coinflip_bet]);
		if (betUsers[user.steamid]) return socket.emit('notify', 'error', 'coinflipPending');
		connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				logger.debug(err);
				socket.emit('notify', 'error', 'coinflipPlayFailed');
				return;
			}
			if (row[0].wallet >= play) {
				connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + parseInt(play) + ', `total_bet` = `total_bet` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err2, row2) {
					if (row[0].deposit_sum >= config.min_bet_wager) {
						connection.query('UPDATE `users` SET `wager` = `wager` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid));
					}
					if (err2) {
						logger.debug(err2);
						socket.emit('notify', 'error', 'coinflipPlayFailed');
						return;
					}
					var cfUnique = generate(20);
					connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = -' + connection.escape(play) + ', `reason` = \'Coinflip #' + cfUnique + ' ' + color.toUpperCase() + '\'', function(err3, row3) {
						if (err3) {
							logger.debug('important error at wallet_change');
							logger.debug(err3);
							socket.emit('notify', 'error', 'serverError');
							return;
						}
						io.sockets.to('coinflip').emit('coinflip game', {
							amount: play,
							player: {
								avatar: user.avatar,
								steamid: user.steamid,
								username: user.username
							},
							status: 'open',
							side: color,
							hash: cfUnique
						});
						cfBets.push({
							amount: play,
							player: {
								avatar: user.avatar,
								steamid: user.steamid,
								username: user.username
							},
							status: 'open',
							side: color,
							hash: cfUnique,
							left: 10
						});
						betUsers[user.steamid] = 1;
						if (users[user.steamid])
							users[user.steamid].socket.forEach(function(asocket) {
								if (io.sockets.connected[asocket])
									io.sockets.connected[asocket].emit('balance change', parseInt('-' + play));
								if (io.sockets.connected[asocket])
									io.sockets.connected[asocket].emit('notify', 'success', 'coinflipPlaySuccess', [play, color.toUpperCase()]);
							});
					});
				});
			} else {
				socket.emit('notify', 'error', 'notEnoughCoins');
			}
		});
	});
	socket.on('coinflip join', function(gameID) {
		if (!active["coinflip"]) return socket.emit('notify', 'error', 'closed');
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!gameID) return socket.emit('notify', 'error', 'coinflipPlayFailed');
		if (typeof gameID != 'string') return socket.emit('notify', 'error', 'coinflipPlayFailed');
		var index = cfBets.map(function(e) {
			return e.hash;
		}).indexOf(gameID);
		if (index > -1) {
			if (!cfBets[index]) return;
			if (cfBets[index].status === 'closed') return socket.emit('notify', 'error', 'coinflipAlreadyJoined');
			if (cfBets[index].player.steamid == user.steamid) return socket.emit('notify', 'error', 'coinflipOwner');
			var play = cfBets[index].amount;
			if (cfBets[index].side === 'ct') {
				var color = 't';
			} else {
				var color = 'ct';
			}
			connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
				if ((err) || (!row.length)) {
					logger.debug(err);
					socket.emit('notify', 'error', 'coinflipPlayFailed');
					return;
				}
				if (row[0].wallet >= play) {
					cfBets[index].status = 'closed';
					connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + parseInt(play) + ', `total_bet` = `total_bet` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err2, row2) {
						if (row[0].deposit_sum >= config.min_bet_wager) {
							connection.query('UPDATE `users` SET `wager` = `wager` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid));
						}
						if (err2) {
							cfBets[index].status = 'open';
							logger.debug(err2);
							socket.emit('notify', 'error', 'coinflipPlayFailed');
							return;
						}
						connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = -' + connection.escape(play) + ', `reason` = \'Coinflip #' + cfBets[index].hash + ' ' + color.toUpperCase() + '\'', function(err3, row3) {
							if (err3) {
								cfBets[index].status = 'open';
								logger.debug('important error at wallet_change');
								logger.debug(err3);
								socket.emit('notify', 'error', 'serverError');
								return;
							}
							cfBets[index].opponent = {
								avatar: user.avatar,
								steamid: user.steamid,
								username: user.username
							};
							if (users[user.steamid])
								users[user.steamid].socket.forEach(function(asocket) {
									if (io.sockets.connected[asocket])
										io.sockets.connected[asocket].emit('balance change', parseInt('-' + play));
									if (io.sockets.connected[asocket])
										io.sockets.connected[asocket].emit('notify', 'success', 'coinflipJoin');
								});
							if (users[cfBets[index].player.steamid])
								users[cfBets[index].player.steamid].socket.forEach(function(asocket) {
									if (io.sockets.connected[asocket])
										io.sockets.connected[asocket].emit('notify', 'success', 'coinflipJoined');
								});
							io.sockets.to('coinflip').emit('coinflip update', cfBets[index].hash, {
								avatar: user.avatar,
								steamid: user.steamid,
								username: user.username,
								side: color
							});
							var countDown = setInterval(function() {
								cfBets[index].left -= 1;
								if (cfBets[index].left === 0) {
									clearInterval(countDown);
								}
							}, 1000);
							setTimeout(function() {
								delete betUsers[cfBets[index].player.steamid];
								var possible = ['ct', 't'];
								var wonSide = possible[Math.floor(Math.random() * possible.length)];
								var wonAmount = parseInt(play) * 2;
								wonAmount = Math.floor(wonAmount - (wonAmount * 0.15));
								rakeAmount = Math.floor(wonAmount - (wonAmount * 0.85));
								if (wonSide == color) {
									connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + wonAmount + ', `total_won` = `total_won` + ' + wonAmount + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err69, row69) {
										if (err69) {
											return;
										} else {
											connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = ' + connection.escape(wonAmount) + ', `reason` = \'Coinflip #' + cfBets[index].hash + ' ' + 'winning!' + '\'', function(err70) {
												if (err70) {
													logger.debug('database error at wallet_change');
													logger.debug(err70);
												}
												connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + play + ' WHERE `steamid` = ' + connection.escape(cfBets[index].player.steamid), function(err71) {
													if (err71) logger.debug('error at total lose increase');
												});
												setTimeout(function() {
													if (users[user.steamid]) {
														users[user.steamid].socket.forEach(function(asocket) {
															if (io.sockets.connected[asocket])
																io.sockets.connected[asocket].emit('balance change', wonAmount);
															if (io.sockets.connected[asocket])
																io.sockets.connected[asocket].emit('notify', 'success', 'coinflipWon', [wonAmount]);
														});
													}
													if (users[cfBets[index].player.steamid]) {
														users[cfBets[index].player.steamid].socket.forEach(function(asocket) {
															if (io.sockets.connected[asocket])
																io.sockets.connected[asocket].emit('notify', 'error', 'coinflipLost', [wonAmount]);
														});
													}
												}, 3600);
											});
										}
									});
								} else {
									connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + wonAmount + ', `total_won` = `total_won` + ' + wonAmount + ' WHERE `steamid` = ' + connection.escape(cfBets[index].player.steamid), function(err69, row69) {
										if (err69) {
											return;
										} else {
											connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(cfBets[index].player.steamid) + ', `change` = ' + connection.escape(wonAmount) + ', `reason` = \'Coinflip #' + cfBets[index].hash + ' ' + 'winning!' + '\'', function(err70) {
												if (err70) {
													logger.debug('database error at wallet_change');
													logger.debug(err70);
												}
												connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + play + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err71) {
													if (err71) logger.debug('error at total lose increase');
												});
												setTimeout(function() {
													if (users[cfBets[index].player.steamid]) {
														users[cfBets[index].player.steamid].socket.forEach(function(asocket) {
															if (io.sockets.connected[asocket])
																io.sockets.connected[asocket].emit('balance change', wonAmount);
															if (io.sockets.connected[asocket])
																io.sockets.connected[asocket].emit('notify', 'success', 'coinflipWon', [wonAmount]);
														});
													}

													if (users[user.steamid]) {
														users[user.steamid].socket.forEach(function(asocket) {
															if (io.sockets.connected[asocket])
																io.sockets.connected[asocket].emit('notify', 'error', 'coinflipLost', [wonAmount]);
														});
													}
												}, 3600);
											});
										}
									});
								}
								setTimeout(function() {
									delete cfBets[index];
								}, 60000);
								io.sockets.to('coinflip').emit('coinflip win', cfBets[index].hash, {
									won: wonSide
								});
							}, 10000);
						});
					});
				} else {
					socket.emit('notify', 'error', 'notEnoughCoins');
				}
			});
		} else {
			return socket.emit('notify', 'error', 'coinflipPlayFailed');
		}
	});
	socket.on('crash bet', function(play) {
		if (!active["crash"]) return socket.emit('notify', 'error', 'closed');
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (play_try[user.steamid]) return;
		if (cstatus === 'closed' || cstatus === 'drop') return socket.emit('notify', 'error', 'crashPlayFailed');
		if (!play) return socket.emit('notify', 'error', 'crashPlayFailed');
		if (!play.bet) return socket.emit('notify', 'error', 'crashPlayFailed');
		if (typeof play.cashout === 'undefined') return socket.emit('notify', 'error', 'crashPlayFailed');
		if (play.cashout !== '' && typeof play.cashout !== 'number') return socket.emit('notify', 'error', 'crashPlayFailed');
		if (typeof play.bet !== 'number') return socket.emit('notify', 'error', 'crashPlayFailed');
		play.bet = parseInt(play.bet);
		if (isNaN(play.bet)) return socket.emit('notify', 'error', 'cannotParseValue');
		play.bet = '' + play.bet;
		play.bet = play['bet'].replace(/\D/g, '');
		if (play.bet < config.min_crash_bet) return socket.emit('notify', 'error', 'crashMinBet', [play.bet, config.min_crash_bet]);
		if (play.bet > config.max_crash_bet) return socket.emit('notify', 'error', 'crashMaxBet', [play.bet, config.max_crash_bet]);
		play_try[user.steamid] = 1;
		connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				return [socket.emit('notify', 'error', 'crashPlayFailed'), logger.debug(err), delete play_try[user.steamid]];
			}
			if (row[0].wallet >= play.bet) {
				var find = cbets.find(x => x.profile.steamid == user.steamid);
				if (find != undefined) return [socket.emit('notify', 'error', 'crashPlayFailed'), delete play_try[user.steamid]];
				connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + parseInt(play.bet) + ', `total_bet` = `total_bet` + ' + parseInt(play.bet) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err2, row2) {
					if (row[0].deposit_sum >= config.min_bet_wager) {
						connection.query('UPDATE `users` SET `wager` = `wager` + ' + parseInt(play.bet) + ' WHERE `steamid` = ' + connection.escape(user.steamid));
					}
					if (err2) {
						return [socket.emit('notify', 'error', 'crashPlayFailed'), logger.debug(err2), delete play_try[user.steamid]];
					} else {
						connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = -' + connection.escape(play.bet) + ', `reason` = \'Crash #' + cgame + ' - cashout at ' + play.cashout + '\'', function(err3, row3) {
							if (err3) {
								return [logger.debug('important error at wallet_change'), logger.debug(err3), socket.emit('notify', 'error', 'serverError'), delete play_try[user.steamid]];
							} else {
								cbets.push({
									bet: play.bet,
									profile: {
										avatar: user.avatar,
										steamid: user.steamid,
										username: user.username
									}
								});
								players_cashouts[user.steamid] = play.cashout;
								io.sockets.to('crash').emit('player new', [{
									bet: play.bet,
									profile: {
										avatar: user.avatar,
										steamid: user.steamid,
										username: user.username
									}
								}]);
								delete play_try[user.steamid];
								if (users[user.steamid])
									users[user.steamid].socket.forEach(function(asocket) {
										if (io.sockets.connected[asocket])
											io.sockets.connected[asocket].emit('balance change', parseInt('-' + play.bet));
										if (io.sockets.connected[asocket])
											io.sockets.connected[asocket].emit('notify', 'success', 'crashPlaySuccess', [play.bet]);
									});
							}
						});
					}
				});
			} else {
				delete play_try[user.steamid];
				return socket.emit('notify', 'error', 'notEnoughCoins');
			}
		});
	});
	socket.on('crash withdraw', function() {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		crashWithdraw(user);
	});
	socket.on('jackpot play', function(play) {
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!play) return socket.emit('notify', 'error', 'jackpotPlayFailed');
		if ((typeof play != 'string') && (typeof play != 'number')) return socket.emit('notify', 'error', 'jackpotPlayFailed');
		play = parseInt(play);
		if (isNaN(play)) return socket.emit('notify', 'error', 'cannotParseValue');
		play = '' + play;
		play = play.replace(/\D/g, '');
		if (play < config.min_jackpot_bet) return socket.emit('notify', 'error', 'jackpotMinBet', [play, config.min_jackpot_bet]);
		if (play > config.max_jackpot_bet) return socket.emit('notify', 'error', 'jackpotMaxBet', [play, config.max_jackpot_bet]);
		if (jpUsers[user.steamid]) return socket.emit('notify', 'error', 'jackpotPending');
		if (!jpAllow) return socket.emit('notify', 'error', 'jackpotTime');
		jpUsers[user.steamid] = 2;
		connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				delete jpUsers[user.steamid];
				return [socket.emit('notify', 'error', 'jackpotPlayFailed'), logger.debug(err)];
			}
			if (row[0].wallet >= play) {
				connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + parseInt(play) + ', `total_bet` = `total_bet` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err2, row2) {
					if (row[0].deposit_sum >= config.min_bet_wager) {
						connection.query('UPDATE `users` SET `wager` = `wager` + ' + parseInt(play) + ' WHERE `steamid` = ' + connection.escape(user.steamid));
					}
					if (err2) {
						delete jpUsers[user.steamid];
						return [socket.emit('notify', 'error', 'jackpotPlayFailed'), logger.debug(err2)];
					} else {
						connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = -' + connection.escape(play) + ', `reason` = \'Jackpot ' + 'play' + '\'', function(err3, row3) {
							if (err3) {
								delete jpUsers[user.steamid];
								return [logger.debug('important error at wallet_change'), logger.debug(err3), socket.emit('notify', 'error', 'serverError')];
							} else {
								logger.trace(Object.keys(jpUsers).length);
								if (jpTimeleft == -1 && Object.keys(jpUsers).length > 1) jackpotTimer();
								jpBets.push({
									amount: play,
									player: {
										avatar: user.avatar,
										steamid: user.steamid,
										username: user.username
									},
									rangeMin: jpPool + 1,
									rangeMax: jpPool + parseInt(play),
									total: jpPool + parseInt(play)
								});
								jpPool += parseInt(play);
								io.sockets.to('jackpot').emit('jackpot new bet', {
									amount: play,
									player: {
										avatar: user.avatar,
										steamid: user.steamid,
										username: user.username
									},
									total: jpPool
								});
								if (users[user.steamid])
									users[user.steamid].socket.forEach(function(asocket) {
										if (io.sockets.connected[asocket])
											io.sockets.connected[asocket].emit('balance change', parseInt('-' + play));
										if (io.sockets.connected[asocket])
											io.sockets.connected[asocket].emit('notify', 'success', 'jackpotPlaySuccess', [play]);
									});
							}
						});
					}
				});
			} else {
				delete jpUsers[user.steamid];
				return socket.emit('notify', 'error', 'notEnoughCoins');
			}
		});
	});
	socket.on('dice-bet', function(play) {
		if (!active["dice"]) return socket.emit('notify', 'error', 'closed');
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!play) return socket.emit('notify', 'error', 'dicePlayFailed');
		if ((typeof play.value != 'string') && (typeof play.value != 'number')) return socket.emit('notify', 'error', 'dicePlayFailed');
		if ((typeof play.limit != 'string') && (typeof play.limit != 'number')) return socket.emit('notify', 'error', 'dicePlayFailed');
		if ((typeof play.type != 'string') && (typeof play.type != 'number')) return socket.emit('notify', 'error', 'dicePlayFailed');
		betAmount = parseInt(play.value);
		if (betAmount < 0) return socket.emit('notify', 'error', 'dicePlayFailed');
		play.limit = parseInt(play.limit);
		type = parseInt(play.type)
		if (isNaN(betAmount)) return socket.emit('notify', 'error', 'cannotParseValue');
		if (isNaN(play.limit)) return socket.emit('notify', 'error', 'cannotParseValue');
		if (isNaN(type)) return socket.emit('notify', 'error', 'cannotParseValue');
		
		if (play.limit < 5 || play.limit > 9500) return socket.emit('notify', 'error', 'dicePlayFailed');
		
		if (betAmount < config.min_dice_bet) return socket.emit('notify', 'error', 'diceMinBet', [play, config.min_dice_bet]);
		if (betAmount > config.max_dice_bet) return socket.emit('notify', 'error', 'diceMaxBet', [play, config.max_dice_bet]);

		connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				return [socket.emit('notify', 'error', 'dicePlayFailed'), logger.debug(err)];
			}
			if (row[0].wallet >= betAmount) {
				connection.query('UPDATE `users` SET `wallet` = `wallet` - '+parseInt(betAmount)+', `total_bet` = `total_bet` + '+parseInt(betAmount)+' WHERE `steamid` = '+connection.escape(user.steamid), function(err2, row2) {
				
					if(err2) {
						return [socket.emit('notify','error','dicePlayFailed'),logger.debug(err2)];
					} else {
						if(row[0].deposit_sum >= config.min_bet_wager){
							connection.query('UPDATE `users` SET `wager` = `wager` + '+parseInt(betAmount)+' WHERE `steamid` = '+connection.escape(user.steamid), function(err3) {
								if (err3) {
									logger.error('error updating wager: ' + user.steamid);
									logger.debug(err3);
								}
								else{
									connection.query('INSERT INTO `wallet_change` SET `user` = '+connection.escape(user.steamid)+', `change` = -'+connection.escape(betAmount)+', `reason` = \'Dice '+'play'+'\'', function(err4, row3) {
										if(err4) {
											return [logger.error('important error at wallet_change'),logger.debug(err3),socket.emit('notify','error','serverError')];
										} else {
											if (users[user.steamid])
												users[user.steamid].socket.forEach(function(asocket) {
													if (io.sockets.connected[asocket])
														io.sockets.connected[asocket].emit('balance change', parseInt('-' + betAmount));
												});
											var currgame = dice_games[user_dice_current[user.steamid]];
											var multiplier = ((100 / (((play.type == 0 || play.type == "0") ? play.limit : 10000 - play.limit)  / 100)) * (1 - 0.04));
											if (play.type == 0 || play.type == "0") {
												if (currgame.roll < play.limit) {
													//won
													profit = betAmount * multiplier - betAmount;
												} else {
													profit = -betAmount;

												}

											} else {
												if (currgame.roll > play.limit) {
													//won
													profit = betAmount * multiplier - betAmount;
												} else {
													profit = -betAmount;
												}
											}
											dice_games[user_dice_current[user.steamid]] = {
												"hash": currgame.hash,
												"id": dice_games.count,
												"limit": play.limit,
												"multiplier": multiplier,
												"profit": profit,
												"roll": currgame.roll,
												"secret": currgame.secret,
												"type": play.type,
												"value": betAmount,
												"user": {
													"avatar": user.avatar,
													"id": user.steamid,
													"rank": user.rank,
													"username": user.username
												}
											};
											if(profit > 0){
												connection.query('UPDATE `users` SET `wallet` = `wallet` + '+parseInt(betAmount * multiplier)+', `total_bet` = `total_bet` + '+parseInt(betAmount * multiplier)+' WHERE `steamid` = '+connection.escape(user.steamid), function(err5, row2) {
					
													if(err5) {
														return [socket.emit('notify','error','dicePlayFailed'),logger.debug(err2)];
													} else {
														connection.query('INSERT INTO `wallet_change` SET `user` = '+connection.escape(user.steamid)+', `change` = '+connection.escape(betAmount * multiplier)+', `reason` = \'Dice '+'win'+'\'', function(err6, row3) {
															if(err6) {
																return [logger.error('important error at wallet_change'),logger.debug(err3),socket.emit('notify','error','serverError')];
															} 
														});
													}
												});
											}
											io.sockets.emit('dice-game', {
												"game": dice_games[user_dice_current[user.steamid]]
											});
											socket.emit('dice-result', {
												"game": dice_games[user_dice_current[user.steamid]],
												"hash": generateDiceGame(user.steamid)
											});
											
										}
									});
								}
							});
						}
					}
				});
			} else {
				return socket.emit('notify', 'error', 'notEnoughCoins');
			}
		});
	});
	/*socket.on('mines start', function(play) {
		if (!active["mines"]) return socket.emit('notify', 'error', 'closed');
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!play) return socket.emit('notify', 'error', 'minesPlayFailed');
		if ((typeof play.amount != 'string') && (typeof play.amount != 'number')) return socket.emit('notify', 'error', 'minesPlayFailed');
		if ((typeof play.bombs != 'string') && (typeof play.bombs != 'number')) return socket.emit('notify', 'error', 'minesPlayFailed');
		betAmount = parseInt(play.amount);
		bombs = parseInt(play.bombs);

		if (isNaN(betAmount)) return socket.emit('notify', 'error', 'cannotParseValue');
		if (isNaN(bombs)) return socket.emit('notify', 'error', 'cannotParseValue');

		if (betAmount < config.min_dice_bet) return socket.emit('notify', 'error', 'minesMinBet', [play, config.min_dice_bet]);
		if (betAmount > config.max_dice_bet) return socket.emit('notify', 'error', 'minesMaxBet', [play, config.max_dice_bet]);

		connection.query('SELECT `wallet`,`deposit_sum` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
			if ((err) || (!row.length)) {
				return [socket.emit('notify', 'error', 'minesPlayFailed'), logger.debug(err)];
			}
			if (row[0].wallet >= betAmount) {
				/* connection.query('UPDATE `users` SET `wallet` = `wallet` - '+parseInt(play)+', `total_bet` = `total_bet` + '+parseInt(play)+' WHERE `steamid` = '+connection.escape(user.steamid), function(err2, row2) {
		  if(row[0].deposit_sum >= config.min_bet_wager){
		  connection.query('UPDATE `users` SET `wager` = `wager` + '+parseInt(play)+' WHERE `steamid` = '+connection.escape(user.steamid));
		  }
		 if(err2) {
			return [socket.emit('notify','error','dicePlayFailed'),logger.debug(err2)];
		  } else {
			connection.query('INSERT INTO `wallet_change` SET `user` = '+connection.escape(user.steamid)+', `change` = -'+connection.escape(play)+', `reason` = \'Dice '+'play'+'\'', function(err3, row3) {
			  if(err3) {
				return [logger.debug('important error at wallet_change'),logger.debug(err3),socket.emit('notify','error','serverError')];
			  } else {*//*
				var gameID =  mines_games.length;
				var arraytmp = [];
				for (var i = 1; i <= 25; i++) {
					arraytmp[i] = i;
				}
				arraytmp.sort(function() {
					return .5 - Math.random();
				});
				var mines = [];
				for (var i = 0; i < bombs; i++) {
					mines[i] = arraytmp[i];
				}
				var secret = sha256(generate(128));
				var hash = sha256(bombs + ":" + secret);
				user_mines_current[user.steamid] = gameID;
				mines_games[gameID]={
					"id":gameID,
					"bet": betAmount,
					"bombs": bombs,
					"hash": hash,
					"payout": betAmount,
					"secret": secret,
					"nextPayout": 2,
					"selectedTiles": [],
					"mines": mines
				};
				socket.emit("mines start", {
					"id":gameID,
					"bet": betAmount,
					"bombs": bombs,
					"hash": hash,
					"nextPayout": 2,
					"selectedTiles": []
				});
				/* }
			});
		  }
		});*//*
			} else {
				return socket.emit('notify', 'error', 'notEnoughCoins');
			}
		});
	});
	socket.on('mines click', function(play) {
		if (!active["mines"]) return socket.emit('notify', 'error', 'closed');
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (!play) return socket.emit('notify', 'error', 'minesPlayFailed');
		if ((typeof play.position != 'string') && (typeof play.position != 'number')) return socket.emit('notify', 'error', 'minesPlayFailed');
		position = parseInt(play.position);

		if (isNaN(position)) return socket.emit('notify', 'error', 'cannotParseValue');
		mines_games[user_mines_current[user.steamid]].payout+=mines_games[user_mines_current[user.steamid]].nextPayout;
		mines_games[user_mines_current[user.steamid]].nextPayout+=1;
		mines_games[user_mines_current[user.steamid]].selectedTiles.push(position);
		if(mines_games[user_mines_current[user.steamid]].mines.includes(position)){
			socket.emit("mines game", {
				"id": user_mines_current[user.steamid],
				"payout": mines_games[user_mines_current[user.steamid]].payout,
				"position": position,
				"nextPayout": mines_games[user_mines_current[user.steamid]].nextPayout,
				"value": -1,
				"secret": mines_games[user_mines_current[user.steamid]].secret,
			});
		}
		else{
			socket.emit("mines game", {
				"id": user_mines_current[user.steamid],
				"payout": mines_games[user_mines_current[user.steamid]].payout,
				"position": position,
				"nextPayout": mines_games[user_mines_current[user.steamid]].nextPayout,
				"value": mines_games[user_mines_current[user.steamid]].nextPayout-1
			});
		}
	});*/
	socket.on('chat message', function(chat) {
		if ((!chat.message) || (!chat.type)) return;
		if ((typeof chat.message != 'string') || (typeof chat.type != 'string')) return;
		if (last_message[user.steamid] + 1 >= time()) {
			return;
		} else {
			last_message[user.steamid] = time();
		}
		if (!user) return socket.emit('notify', 'error', 'notLoggedIn');
		if (chat && chat.message) {
			if (chat.message.indexOf('/') === 0) {
				var res = null;
				if (chat.message.indexOf('/send') === 0) {
					if (res = /^\/send ([0-9]{17}) ([0-9]{1,})/.exec(chat.message)) {
						if ((res[2] < 1) || (res[2] > 100000)) {
							return socket.emit('notify', 'error', 'chatSendOutOfRange');
						} else {
							var send_amount = parseInt(res[2]);
							if (isNaN(send_amount)) return socket.emit('notify', 'error', 'cannotParseValue');
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + user.steamid + ' LIMIT 1', function(error, ppl) {
								if (error) {
									logger.debug(error);
									return socket.emit('notify', 'error', 'chatSendFail', [res[2], res[1]]);
								} else {
									if (ppl[0].total_bet < config.min_bet_send) {
										return socket.emit('notify', 'error', 'chatSendNotEnoughCoins', [config.min_bet_send]);
									} else if (ppl[0].deposit_sum < config.min_deposit_send) {
										return socket.emit('notify', 'error', 'chatSendNotEnoughDeposit', [config.min_deposit_send]);
									} else if (ppl[0].wallet < send_amount) {
										return socket.emit('notify', 'error', 'chatSendOutOfRange');
									} else if (ppl[0].transfer_banned || (ppl[0].wallet >= 100000 && ppl[0].withdraw_approved == 0 && user.rank != "root")) {
										return socket.emit('notify', 'error', 'chatSendUnavailable');
									} else {
										connection.query('SELECT * FROM `users` WHERE `steamid` = ' + res[1], function(error_2, receiver) {
											if (error_2) {
												logger.debug(error_2);
												return socket.emit('notify', 'error', 'chatSendFail', [res[2], res[1]]);
											} else {
												if ((!receiver) || (!receiver.length)) {
													return socket.emit('notify', 'error', 'chatSendFail', [res[2], res[1]]);
												} else {
													connection.query('UPDATE `users` SET `wallet` = `wallet` - ' + send_amount + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(error_3) {
														if (error_3) {
															logger.debug(error_3);
															return socket.emit('notify', 'error', 'chatSendFail', [res[2], res[1]]);
														} else {
															connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + send_amount + ' WHERE `steamid` = ' + connection.escape(res[1]), function(error_4) {
																if (error_4) {
																	logger.debug('error. cant give coins to receiver! ' + res[1]);
																	logger.debug(error_4);
																	return socket.emit('notify', 'error', 'chatSendFail', [res[2], res[1]]);
																} else {
																	connection.query('INSERT INTO `wallet_change` SET `change` = ' + connection.escape('-' + send_amount) + ',`reason` = ' + connection.escape('Sent ' + send_amount + ' coins to ' + res[1]) + ',`user` = ' + connection.escape(user.steamid), function(error_5) {
																		if (error_5) {
																			logger.debug('error. not inserted wallet change for sender.');
																			logger.debug(error_5);
																		} else {
																			connection.query('INSERT INTO `wallet_change` SET `change` = ' + connection.escape(send_amount) + ',`reason` = ' + connection.escape('Received ' + send_amount + ' coins from ' + user.steamid) + ',`user` = ' + connection.escape(res[1]), function(error_6) {
																				if (error_6) {
																					logger.debug('error. not inserted wallet change for receiver.');
																					logger.debug(error_6);
																				}
																			});
																		}
																	});
																	if (users[user.steamid])
																		users[user.steamid].socket.forEach(function(asocket) {
																			if (io.sockets.connected[asocket]) {
																				io.sockets.connected[asocket].emit('balance change', parseInt('-' + send_amount));
																				io.sockets.connected[asocket].emit('notify', 'success', 'chatSendSuccess', [send_amount, res[1]]);
																			}
																		});
																	if (users[res[1]])
																		users[res[1]].socket.forEach(function(asocket) {
																			if (io.sockets.connected[asocket]) {
																				io.sockets.connected[asocket].emit('balance change', send_amount);
																				io.sockets.connected[asocket].emit('notify', 'success', 'chatSendReceived', [send_amount, res[1]]);
																			}
																		});
																}
															});
														}
													});
												}
											}
										});
									}
								}
							});
						}
					} else {
						socket.emit('notify', 'error', 'chatMissingParameters');
					}
				} 
				else if (chat.message.indexOf('/ref') === 0) {
					if (res = /^\/ref (.)/.exec(chat.message)) {
						if (res = /^\/ref (.{2,254})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(user_error, ouruser) {
								if ((user_error) || (ouruser.length !== 1)) {
									logger.debug('cannot get user from referral');
									logger.debug(user_error);
									return;
								} else if ((ouruser) && (ouruser.length === 1) && (ouruser[0].inviter.length > 0)) {
									return socket.emit('notify', 'error', 'chatReferralAlreadyUsed');
								} else {
									if (user.csgo == 'true') {
										connection.query('SELECT * FROM `users` WHERE `code` = ' + connection.escape(res[1].toUpperCase()) + ' LIMIT 1', function(codes_error, codes) {
											if (codes_error) {
												socket.emit('notify', 'error', 'chatReferralFailed');
											} else if ((codes[0]) && (codes[0].steamid == user.steamid)) {
												socket.emit('notify', 'error', 'chatReferralOwnCode');
											} else {
												if (codes.length > 0) {
													connection.query('UPDATE `users` SET `inviter` = ' + connection.escape(codes[0].steamid) + ', `wallet` = `wallet` + 100 WHERE `steamid` = ' + connection.escape(user.steamid), function(update_code_error, update_code) {
														if (update_code_error) {
															logger.debug('error while referal');
															logger.debug(update_code_error);
															socket.emit('notify', 'error', 'chatReferralFailed');
															return;
														} else {
															connection.query('INSERT INTO `wallet_change` SET `change` = \'100\',`reason` = \'Referral - free\',`user` = ' + connection.escape(user.steamid));
														}
													});
													socket.emit('notify', 'success', 'chatReferralSuccess', [res[1], 100]);
													if (users[user.steamid])
														users[user.steamid].socket.forEach(function(asocket) {
															if (io.sockets.connected[asocket]) {
																io.sockets.connected[asocket].emit('balance change', 100);
															}
														});
												} else {
													socket.emit('notify', 'error', 'chatReferralUnknown');
												}
											}
										});
									} else {
										socket.emit('notify', 'error', 'chatReferralNoCSGO');
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatReferralUnknown');
						}
					} else {
						socket.emit('notify', 'error', 'chatMissingParameters');
					}
				} 
				else if (chat.message.indexOf('/muteChat') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root')) {
						chat_muted = true;
						socket.emit('notify', 'success', 'chatMuted');
					} else {
						socket.emit('notify', 'error', 'chatAdminAccess');
					}
				} 
				else if (chat.message.indexOf('/unmuteChat') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root')) {
						chat_muted = false;
						socket.emit('notify', 'success', 'chatUnmuted');
					} else {
						socket.emit('notify', 'error', 'chatAdminAccess');
					}
				} 
				else if (chat.message.indexOf('/access') === 0) {
					if (user.rank === 'root') {
						if (res = /^\/access ([0-9]{17}) (.{1,})/.exec(chat.message)) {
							if ((res[2] == 'user') || (res[2] == 'siteMod') || (res[2] == 'siteAdmin') || (res[2] == 'root') || (res[2] == 'youtuber') || (res[2] == 'twitch')) {
								connection.query('UPDATE `users` SET `rank` = ' + connection.escape(res[2]) + ' WHERE `steamid` = ' + connection.escape(res[1]), function(access_err) {
									var levels = {
										user: 1,
										siteMod: 2,
										siteAdmin: 3,
										root: 4
									};
									if (access_err) {
										return socket.emit('notify', 'error', 'chatAccessLevelFailed', [levels[res[2]], res[1]]);
									} else {
										return socket.emit('notify', 'success', 'chatAccessLevelSuccess', [levels[res[2]], res[1]]);
									}
								});
							} else {
								return socket.emit('notify', 'error', 'chatAccessLevelOutOfRange');
							}
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatRootAccess');
					}
				} 
				else if (chat.message.indexOf('/give') === 0) {
					if (user.rank === 'root') {
						if (res = /^\/give ([0-9]{17}) ([0-9]{1,})/.exec(chat.message)) {
							connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + connection.escape(res[2]) + ' WHERE `steamid` = ' + connection.escape(res[1]), function(give_error) {
								if (give_error) {
									logger.debug(give_error);
									socket.emit('notify', 'error', 'chatGiveFail');
								} else {
									connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(res[1]) + ', `change` = ' + connection.escape(res[2]) + ', `reason` = \'Received from server\'');
									if (users[res[1]]) {
										users[res[1]].socket.forEach(function(asocket) {
											if (io.sockets.connected[asocket])
												io.sockets.connected[asocket].emit('balance change', parseInt(res[2]));
										});
									}
									socket.emit('notify', 'success', 'chatGiveSuccess', [res[2], res[1]]);
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatRootAccess');
					}
				} 
				else if (chat.message.indexOf('/coins') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root')) {
						connection.query('SELECT SUM(`wallet`) AS `sum` FROM `users`', function(error, total) {
							if (error) {
								return;
							} else {
								var total = total[0].sum;
								var total_inv = 0;
								connection.query('SELECT * FROM `inventory`', function(inv_err, inventory) {
									if (inv_err) {
										return;
									} else {
										for (key in inventory) {
											var obj = inventory[key];
											if (prices[obj['market_hash_name']])
												var a_price = prices[obj['market_hash_name']] * 1000;
											else var a_price = 0;
											total_inv += a_price;
										}
										socket.emit('notify', 'success', 'chatCoinsBalance', [0, total_inv, total]);
									}
								});
							}
						});
					} else {
						socket.emit('notify', 'error', 'chatRootAccess');
					}
				} 
				else if (chat.message.indexOf('/mute') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/mute ([0-9]{17}) ([0-9]{1,})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(mute_err, mute_callback) {
								if (mute_err) {
									return socket.emit('notify', 'error', 'chatMuteFail', [res[1]]);
								} else {
									if ((mute_callback) && (mute_callback.length)) {
										if (mute_callback[0].rank == 'user') {
											var mutedFor = time() + res[2]*60;
											connection.query('UPDATE `users` SET `muted` = ' + connection.escape(mutedFor) + ' WHERE `steamid` = ' + connection.escape(res[1]), function(mute_err1) {
												if (mute_err1) {
													return socket.emit('notify', 'error', 'chatMuteFail', [res[1]]);
												} else {
													if (users[res[1]]) users[res[1]].muted = mutedFor;
													return socket.emit('notify', 'success', 'chatMuteSuccess', [res[1]]);
												}
											});
										} else {
											return socket.emit('notify', 'error', 'chatMuteStaff');
										}
									} else {
										return socket.emit('notify', 'error', 'chatMuteFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/unmute') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/unmute ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(unmute_err, unmute_callback) {
								if (unmute_err) {
									return socket.emit('notify', 'error', 'chatUnmuteFail', [res[1]]);
								} else {
									if ((unmute_callback) && (unmute_callback.length)) {
										if (unmute_callback[0].rank == 'user') {
											if (unmute_callback[0].muted >= 1) {
												connection.query('UPDATE `users` SET `muted` = 0 WHERE `steamid` = ' + connection.escape(res[1]), function(unmute_err1) {
													if (unmute_err1) {
														return socket.emit('notify', 'error', 'chatUnmuteFail', [res[1]]);
													} else {
													if (users[res[1]]) users[res[1]].muted = 0;
														return socket.emit('notify', 'success', 'chatUnmuteSuccess', [res[1]]);
													}
												});
											} else {
												return socket.emit('notify', 'error', 'chatUnmuteNotMuted', [res[1]]);
											}
										} else {
											return socket.emit('notify', 'error', 'chatUnmuteStaff');
										}
									} else {
										return socket.emit('notify', 'error', 'chatUnmuteFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				}
				else if (chat.message.indexOf('/ban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/ban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(ban_err, ban_callback) {
								if (ban_err) {
									return socket.emit('notify', 'error', 'chatBanFail', [res[1]]);
								} else {
									if ((ban_callback) && (ban_callback.length)) {
										if (ban_callback[0].rank == 'user') {
											connection.query('UPDATE `users` SET `banned` = 1 WHERE `steamid` = ' + connection.escape(res[1]), function(ban_err1) {
												if (ban_err1) {
													return socket.emit('notify', 'error', 'chatBanFail', [res[1]]);
												} else {
													return socket.emit('notify', 'success', 'chatBanSuccess', [res[1]]);
												}
											});
										} else {
											return socket.emit('notify', 'error', 'chatBanStaff');
										}
									} else {
										return socket.emit('notify', 'error', 'chatBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/unban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/unban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(unban_err, unban_callback) {
								if (unban_err) {
									return socket.emit('notify', 'error', 'chatUnBanFail', [res[1]]);
								} else {
									if ((unban_callback) && (unban_callback.length)) {
										if (unban_callback[0].banned == 1) {
											connection.query('UPDATE `users` SET `banned` = 0 WHERE `steamid` = ' + connection.escape(res[1]), function(unban_err1) {
												if (unban_err1) {
													return socket.emit('notify', 'error', 'chatUnBanFail', [res[1]]);
												} else {
													return socket.emit('notify', 'success', 'chatUnBanSuccess', [res[1]]);
												}
											});
										} else {
											return socket.emit('notify', 'error', 'chatUnbanNotBanned', [res[1]]);
										}
								} else {
										return socket.emit('notify', 'error', 'chatUnBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				}
				else if (chat.message.indexOf('/withdrawban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/withdrawban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(ban_err, ban_callback) {
								if (ban_err) {
									return socket.emit('notify', 'error', 'chatWithdrawBanFail', [res[1]]);
								} else {
									if ((ban_callback) && (ban_callback.length)) {
										connection.query('UPDATE `users` SET `withdraw_ban` = 1 AND `transfer_banned` = 1 WHERE `steamid` = ' + connection.escape(res[1]), function(ban_err1) {
											if (ban_err1) {
												return socket.emit('notify', 'error', 'chatWithdrawBanFail', [res[1]]);
											} else {
												return socket.emit('notify', 'success', 'chatWithdrawBanSuccess', [res[1]]);
											}
										});
									} else {
										return socket.emit('notify', 'error', 'chatWithdrawBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/unwithdrawban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/unwithdrawban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(unban_err, unban_callback) {
								if (unban_err) {
									return socket.emit('notify', 'error', 'chatUnWithdrawBanFail', [res[1]]);
								} else {
									if ((unban_callback) && (unban_callback.length)) {
										if (unban_callback[0].withdraw_ban == 1) {
											connection.query('UPDATE `users` SET `withdraw_ban` = 0 AND `transfer_banned` = 0 WHERE `steamid` = ' + connection.escape(res[1]), function(unban_err1) {
												if (unban_err1) {
													return socket.emit('notify', 'error', 'chatUnWithdrawBanFail', [res[1]]);
												} else {
													return socket.emit('notify', 'success', 'chatUnWithdrawBanSuccess', [res[1]]);
												}
											});
										} else {
											return socket.emit('notify', 'error', 'chatUnWithdrawbanNotBanned', [res[1]]);
										}
								} else {
										return socket.emit('notify', 'error', 'chatUnWithdrawBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				}
				else if (chat.message.indexOf('/transferban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/transferban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(ban_err, ban_callback) {
								if (ban_err) {
									return socket.emit('notify', 'error', 'chatTransferBanFail', [res[1]]);
								} else {
									if ((ban_callback) && (ban_callback.length)) {
										connection.query('UPDATE `users` SET `transfer_banned` = 1 WHERE `steamid` = ' + connection.escape(res[1]), function(ban_err1) {
											if (ban_err1) {
												return socket.emit('notify', 'error', 'chatTransferBanFail', [res[1]]);
											} else {
												return socket.emit('notify', 'success', 'chatTransferBanSuccess', [res[1]]);
											}
										});
									} else {
										return socket.emit('notify', 'error', 'chatTransferBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/untransferban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/untransferban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(unban_err, unban_callback) {
								if (unban_err) {
									return socket.emit('notify', 'error', 'chatUnTransferBanFail', [res[1]]);
								} else {
									if ((unban_callback) && (unban_callback.length)) {
										if (unban_callback[0].transfer_banned == 1) {
											connection.query('UPDATE `users` SET `transfer_banned` = 0 WHERE `steamid` = ' + connection.escape(res[1]), function(unban_err1) {
												if (unban_err1) {
													return socket.emit('notify', 'error', 'chatUnTransferBanFail', [res[1]]);
												} else {
													return socket.emit('notify', 'success', 'chatUnTransferBanSuccess', [res[1]]);
												}
											});
										} else {
											return socket.emit('notify', 'error', 'chatUnTransferbanNotBanned', [res[1]]);
										}
								} else {
										return socket.emit('notify', 'error', 'chatUnTransferBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				}
				else if (chat.message.indexOf('/depositban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/depositban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(ban_err, ban_callback) {
								if (ban_err) {
									return socket.emit('notify', 'error', 'chatDepositBanFail', [res[1]]);
								} else {
									if ((ban_callback) && (ban_callback.length)) {
										connection.query('UPDATE `users` SET `deposit_ban` = 1 WHERE `steamid` = ' + connection.escape(res[1]), function(ban_err1) {
											if (ban_err1) {
												return socket.emit('notify', 'error', 'chatDepositBanFail', [res[1]]);
											} else {
												return socket.emit('notify', 'success', 'chatDepositBanSuccess', [res[1]]);
											}
										});
									} else {
										return socket.emit('notify', 'error', 'chatDepositBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/undepositban') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/undepositban ([0-9]{17})/.exec(chat.message)) {
							connection.query('SELECT * FROM `users` WHERE `steamid` = ' + connection.escape(res[1]) + ' LIMIT 1', function(unban_err, unban_callback) {
								if (unban_err) {
									return socket.emit('notify', 'error', 'chatUnDepositBanFail', [res[1]]);
								} else {
									if ((unban_callback) && (unban_callback.length)) {
										if (unban_callback[0].deposit_ban == 1) {
											connection.query('UPDATE `users` SET `deposit_ban` = 0 WHERE `steamid` = ' + connection.escape(res[1]), function(unban_err1) {
												if (unban_err1) {
													return socket.emit('notify', 'error', 'chatUnDepositBanFail', [res[1]]);
												} else {
													return socket.emit('notify', 'success', 'chatUnDepositBanSuccess', [res[1]]);
												}
											});
										} else {
											return socket.emit('notify', 'error', 'chatUnDepositbanNotBanned', [res[1]]);
										}
								} else {
										return socket.emit('notify', 'error', 'chatUnDepositBanFail', [res[1]]);
									}
								}
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				}
				else if (chat.message.indexOf('/removeMessages') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/removeMessages ([0-9]{17})/.exec(chat.message)) {
							chat_history = chat_history.filter(function(obj) {
								return obj.profile.steamid !== res[1];
							});
							io.sockets.emit('remove messages', {
								"steamid": res[1]
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/removeMessage') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/removeMessage (.{1,})/.exec(chat.message)) {
							var index = chat_history.map(function(e) {
								return e.uniqueID;
							}).indexOf(res[1]);
							if (index > -1) {
								chat_history.splice(index, 1);
							}
							io.sockets.emit('remove message', {
								"uniqueID": res[1]
							});
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/active') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root')) {
						if (res = /^\/active (.{1,}) (.{1,})/.exec(chat.message)) {
							if (res[2] == "false") {
								active[res[1]] = false;
							} else {
								active[res[1]] = true;
							}
							return socket.emit('notify', 'success', 'chatAccessSet', [res[1], res[2]]);
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatRootAccess');
					}
				} 
				else if (chat.message.indexOf('/isactive') === 0) {
					if ((user.rank === 'siteAdmin') || (user.rank === 'root') || (user.rank === 'siteMod')) {
						if (res = /^\/isactive (.{1,})/.exec(chat.message)) {
							return socket.emit('notify', 'success', 'chatAccessView', [res[1], active[res[1]]]);
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatModAccess');
					}
				} 
				else if (chat.message.indexOf('/config') === 0) {
					if (user.rank === 'root') {
						if (res = /^\/config/.exec(chat.message)) {
							config = require('./config');
						} else {
							socket.emit('notify', 'error', 'chatMissingParameters');
						}
					} else {
						socket.emit('notify', 'error', 'chatRootAccess');
					}
				} else {
					return socket.emit('notify', 'error', 'chatUnknownCommand');
				}
			} 
			else {
				if (((chat_muted === false) && (user.muted <= time())) || (user.rank != 'user')) {
					if(chat.message.length <= 256 || user.rank != 'user'){
						connection.query('SELECT `total_bet` FROM `users` WHERE `steamid` = ' + connection.escape(user.steamid) + ' LIMIT 1', function(err, row) {
							if (err) {
								socket.emit('notify', 'error', 'serverError');
								return;
							} else {
								if ((row[0].total_bet < config.min_bet_chat) && (user.rank == 'user')) {
									socket.emit('notify', 'error', 'chatNotEnoughBets', [row[0].total_bet, config.min_bet_chat]);
									return;
								} else {
									var uniqueID = generate(20);
									io.sockets.emit('chat message', {
										message: chat.message,
										profile: {
											avatar: user.avatar,
											rank: user.rank,
											steamid: user.steamid,
											username: user.username
										},
										time: time(),
										uniqueID: uniqueID
									});
									array_limit({
										message: chat.message,
										profile: {
											avatar: user.avatar,
											rank: user.rank,
											steamid: user.steamid,
											username: user.username
										},
										time: time(),
										uniqueID: uniqueID
									});
								}
							}
						});
					}
					else{
						return socket.emit('notify', 'error', 'chatMaxLength');
					}
				} else if(user.muted > time()) {
					return socket.emit('notify', 'error', 'userMuted', [secondsToDhms(user.muted - time())]);
				}else {
					return socket.emit('notify', 'error', 'chatIsMuted');
				}
			}
		}
    });
	/*socket.on('new login', function(steamid){
		steamid = steamid.toString();
		if (!/^\d+$/.test(steamid)) return socket.emit('notify', 'error', 'invalidSteamID');
		socket.emit("login failed");
		var sid = new SteamID(steamid);
		if(!sid.isValid()) return socket.emit('notify', 'error', 'invalidSteamID');
		socket.emit("login failed");
		
		var client = site_bots[Object.keys(site_bots)[Math.floor(Math.random() * Object.keys(site_bots).length)]].client;
		
		steamid = sid.getSteamID64();
		
		user_login_codes[steamid] = {code: generate(20), socket: socket.id};
		socket.emit('login code', user_login_codes[steamid].code);
		/*client.addFriend(steamid, function(err, name){
			if(err){
				if(err.eresult == 14 || err.eresult == "14"){
					user_login_codes[steamid] = {code: generate(20), socket: socket.id};
					socket.emit('login code', user_login_codes[steamid].code);
				}
				else if(err.eresult == 40 || err.eresult == "40"){
					socket.emit('notify', 'error', 'botBlocked');
					socket.emit("login failed");
				}
				else if(err.eresult == 41 || err.eresult == "41"){
					socket.emit('notify', 'error', 'botIgnored');
					socket.emit("login failed");
				}
				else{
					logger.error("Error adding user: " + steamid);
					logger.debug(err);
					socket.emit("login failed");
				}
			}
			else{
				if(name){
					user_login_codes[steamid] = {code: generate(20), socket: socket.id};
					socket.emit('login code', user_login_codes[steamid].code);
				}
				else{
					logger.error("Werid error adding user: " + steamid + ", no error returned but name also not returned");
					socket.emit("login failed");
				}
			}
		});
	});*/
});

function secondsToDhms(d) {
    d = Number(d);
    var dd = Math.floor(d / 24 / 60 / 60);
    var h = Math.floor(d / 60 / 60) % 24;
    var m = Math.floor(d / 60) % 60;
    var s = d % 60;

    var dDisplay = dd > 0 ? dd + (dd == 1 ? " day, " : " days, ") : "";
    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    var toReturn = dDisplay + hDisplay + mDisplay + sDisplay; 
	return toReturn[toReturn.length-1] == " " ? toReturn.slice(0, -2) : toReturn;
}

setInterval(function() {
    io.sockets.emit('users online', Object.keys(users).length);
}, 5000);

function crashWithdraw(user) {
    if (cstatus === 'closed') {
        var find = cbets.find(x => x.profile.steamid == user.steamid);
        if (find == undefined) return;
        if (find.done) return;
        find.done = 1;
        var multiplier = growthFunc(ctime);
        var profit = Math.floor(find.bet * multiplier);
        connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + profit + ', `total_won` = `total_won` + ' + profit + ' WHERE `steamid` = ' + connection.escape(user.steamid), function(err) {
            if (err) {
                logger.debug('important error at wallet increase');
                logger.debug(err);
                if (users[user.steamid]) {
                    users[user.steamid].socket.forEach(function(asocket) {
                        if (io.sockets.connected[asocket])
                            io.sockets.connected[asocket].emit('notify', 'error', 'serverError');
                    });
                }
                return;
            } else {
                if (users[user.steamid]) {
                    users[user.steamid].socket.forEach(function(asocket) {
                        if (io.sockets.connected[asocket])
                            io.sockets.connected[asocket].emit('balance change', profit);
                    });
                }
                io.sockets.to('crash').emit('player drop', {
                    bet: find.bet,
                    multiplier: multiplier.toFixed(2).toString(),
                    profile: {
                        avatar: find.profile.avatar,
                        steamid: find.profile.steamid,
                        username: find.profile.username
                    },
                    profit: profit
                });
                connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(user.steamid) + ', `change` = ' + connection.escape(profit) + ', `reason` = \'Crash #' + cgame + ' ' + 'winning - ' + multiplier.toFixed(2) + '\'', function(err2) {
                    if (err2) {
                        logger.debug('database error at wallet_change');
                        logger.debug(err2);
                        return;
                    }
                });
            }
        });
    } else return;
}

function jackpotTimer() {
    jpTimeleft = jpTime;
    jpAllow = true;
    io.sockets.to('jackpot').emit('jackpot new', jpTime);
    var _timeleft = setInterval(function() {
        --jpTimeleft;
        if (jpTimeleft == config.latest_jackpot_bet_time) jpAllow = false;
        else if (jpTimeleft == 0) {
            var winnerNumber = getRandomInt(1, jpPool);
            var winnerObject = jpBets.find(x => x.rangeMin <= winnerNumber && x.rangeMax >= winnerNumber);
            var winner = winnerObject.player.steamid;
            var winSum = (jpPool - parseInt(winnerObject.amount)) - Math.floor((jpPool - parseInt(winnerObject.amount)) * 0.10) + parseInt(winnerObject.amount);
            if (jpBets.length >= 2) {
                connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + winSum + ', `total_won` = `total_won` + ' + winSum + ' WHERE `steamid` = ' + connection.escape(winner), function(err69, row69) {
                    if (err69) {
                        return;
                    } else {
                        connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(winner) + ', `change` = ' + connection.escape(winSum) + ', `reason` = \'Jackpot winning!' + '\'', function(err70) {
                            if (err70) {
                                logger.debug('database error at wallet_change');
                                logger.debug(err70);
                            }
                            jpBets.forEach(function(obj) {
                                if (JSON.stringify(obj) !== JSON.stringify(winnerObject)) {
                                    connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + obj.amount + ' WHERE `steamid` = ' + connection.escape(obj.player.steamid), function(err71) {
                                        if (err71) logger.debug('error at total lose increase');
                                    });
                                 /*   if (users[obj.player.steamid]) {
                                        users[obj.player.steamid].socket.forEach(function(asocket) {
                                            if (io.sockets.connected[asocket])
                                                io.sockets.connected[asocket].emit('notify', 'error', 'jackpotLost', [obj.amount]);
                                        });
                                    }*/
                                }
                            });
                            jp_limit(winnerObject);
							setTimeout(function(){
								if (users[winner]) {
									users[winner].socket.forEach(function(asocket) {
										if (io.sockets.connected[asocket])
											io.sockets.connected[asocket].emit('balance change', winSum);
										if (io.sockets.connected[asocket])
											io.sockets.connected[asocket].emit('notify', 'success', 'jackpotWon', [winSum]);
									});
								}
								
							}, 15000);
                            var avatars = [];
                            jpBets.forEach(function(obj) {
                                avatars.push(obj.player)
                            });
                            io.sockets.to('jackpot').emit('jackpot end', {
                                winner: winnerObject.player,
                                players: avatars,
                                won: winSum
                            });
                            clearInterval(_timeleft);
                            jpPool = 0;
                            jpBets = [];
                            jpUsers = [];
                            jpAllow = true;
                            jpTimeleft = -1;
                        });
                    }
                });
            } else {
                connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + winSum + ', `total_bet` = `total_bet` - ' + winSum + ' WHERE `steamid` = ' + connection.escape(winner), function(err69, row69) {
                    if (err69) {
                        return;
                    } else {
                        connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(winner) + ', `change` = ' + connection.escape(winSum) + ', `reason` = \'Jackpot winning!' + '\'', function(err70) {
                            if (err70) {
                                logger.debug('database error at wallet_change');
                                logger.debug(err70);
                            }
                            jpBets.forEach(function(obj) {
                                if (JSON.stringify(obj) !== JSON.stringify(winnerObject)) {
                                    connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + obj.amount + ' WHERE `steamid` = ' + connection.escape(obj.player.steamid), function(err71) {
                                        if (err71) logger.debug('error at total lose increase');
                                    });
                                    if (users[obj.player.steamid]) {
                                        users[obj.player.steamid].socket.forEach(function(asocket) {
                                            if (io.sockets.connected[asocket])
                                                io.sockets.connected[asocket].emit('notify', 'error', 'jackpotLost', [obj.amount]);
                                        });
                                    }
                                }
                            });
                            jp_limit(winnerObject);
                            if (users[winner]) {
                                users[winner].socket.forEach(function(asocket) {
                                    if (io.sockets.connected[asocket])
                                        io.sockets.connected[asocket].emit('balance change', winSum);
                                    if (io.sockets.connected[asocket])
                                        io.sockets.connected[asocket].emit('notify', 'success', 'jackpotWon', [winSum]);
                                });
                            }
                            var avatars = [];
                            jpBets.forEach(function(obj) {
                                avatars.push(obj.player)
                            });
                            io.sockets.to('jackpot').emit('jackpot end', {
                                winner: winnerObject.player,
                                players: avatars,
                                won: winSum
                            });
                            clearInterval(_timeleft);
                            jpPool = 0;
                            jpBets = [];
                            jpUsers = [];
                            jpAllow = true;
                            jpTimeleft = -1;
                        });
                    }
                });
            }
        }
    }, 1000);
}

function checkTimer() {
    if (!pause) {
        timerID = setInterval(function() {
            //logger.debug(timer);
            if (timer == 0) {
                away();
            }
            if (timer == -100) {
                currentBets = {
                    'red': [],
                    'green': [],
                    'black': []
                };
                usersBr = {};
                timer = accept + wait;
                currentRollid = currentRollid + 1;
                pause = false;
                var sh = sha256(generate(128));
                winningNumber = sh.substr(0, 8);
                winningNumber = parseInt(winningNumber, 16);
                winningNumber = math.abs(winningNumber) % 15;
				if(winningNumber == 0 && math.abs(parseInt(sha256(generate(128)).substr(0, 8), 16)) % 4 != 0){
					var sh = sha256(generate(128));
					winningNumber = sh.substr(0, 8);
					winningNumber = parseInt(winningNumber, 16);
					winningNumber = (math.abs(winningNumber) % 14) + 1;
				}
                secret = generate(20);
                actual_hash = sha256(winningNumber + ":" + secret);
                logger.info('Rolled: ' + winningNumber);
                logger.info('Round #' + currentRollid + ' secret: ' + secret);
                io.sockets.to('roulette').emit('roulette new round', 15, actual_hash);
            }
            timer = timer - 1;
        }, 100);
    }
}

function away() {
    pause = true;
    io.sockets.to('roulette').emit('roulette ends', {
        id: currentRollid,
        winningNumber: winningNumber,
        secret: secret,
        hash: actual_hash,
        shift: Math.random()
    });
    setTimeout(function() {
		roulette_limit(winningNumber);
        if ((winningNumber >= 1) && (winningNumber <= 7)) {
            currentBets['red'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + itm.amount * 2 + ', `total_won` = `total_won` + ' + itm.amount * 2 + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) {
                        logger.error('important error at wallet increase');
                        logger.debug(err);
                        if (users[itm.player.steamid]) {
                            users[itm.player.steamid].socket.forEach(function(asocket) {
                                if (io.sockets.connected[asocket])
                                    io.sockets.connected[asocket].emit('notify', 'error', 'serverError');
                            });
                        }
                        return;
                    } else {
                        if (users[itm.player.steamid]) {
                            users[itm.player.steamid].socket.forEach(function(asocket) {
                                if (io.sockets.connected[asocket])
                                    io.sockets.connected[asocket].emit('balance change', itm.amount * 2);
                            });
                        }
                        connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(itm.player.steamid) + ', `change` = ' + connection.escape(itm.amount * 2) + ', `reason` = \'Roulette #' + currentRollid + ' ' + 'winning!' + '\'', function(err2) {
                            if (err2) {
                                logger.debug('database error at wallet_change');
                                logger.debug(err2);
                                return;
                            }
                        });
                    }
                });
            });
            currentBets['black'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + itm.amount + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) logger.debug('error at total lose increase');
                });
            });
            currentBets['green'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + itm.amount + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) logger.debug('error at total lose increase');
                });
            });
        }
        if ((winningNumber >= 8) && (winningNumber <= 14)) {
            currentBets['black'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + itm.amount * 2 + ', `total_won` = `total_won` + ' + itm.amount * 2 + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) {
                        logger.debug('important error at wallet increase');
                        logger.debug(err);
                        if (users[itm.player.steamid]) {
                            users[itm.player.steamid].socket.forEach(function(asocket) {
                                if (io.sockets.connected[asocket])
                                    io.sockets.connected[asocket].emit('notify', 'error', 'serverError');
                            });
                        }
                        return;
                    } else {
                        if (users[itm.player.steamid]) {
                            users[itm.player.steamid].socket.forEach(function(asocket) {
                                if (io.sockets.connected[asocket])
                                    io.sockets.connected[asocket].emit('balance change', itm.amount * 2);
                            });
                        }
                        connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(itm.player.steamid) + ', `change` = ' + connection.escape(itm.amount * 2) + ', `reason` = \'Roulette #' + currentRollid + ' ' + 'winning!' + '\'', function(err2) {
                            if (err2) {
                                logger.debug('database error at wallet_change');
                                logger.debug(err2);
                                return;
                            }
                        });
                    }
                });
            });
            currentBets['red'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + itm.amount + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) logger.debug('error at total lose increase');
                });
            });
            currentBets['green'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + itm.amount + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) logger.debug('error at total lose increase');
                });
            });
        }
        if ((winningNumber >= 0) && (winningNumber <= 0)) {
            currentBets['green'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `wallet` = `wallet` + ' + itm.amount * 14 + ', `total_won` = `total_won` + ' + itm.amount * 14 + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) {
                        logger.debug('important error at wallet increase');
                        logger.debug(err);
                        if (users[itm.player.steamid]) {
                            users[itm.player.steamid].socket.forEach(function(asocket) {
                                if (io.sockets.connected[asocket])
                                    io.sockets.connected[asocket].emit('notify', 'error', 'serverError');
                            });
                        }
                        return;
                    } else {
                        if (users[itm.player.steamid]) {
                            users[itm.player.steamid].socket.forEach(function(asocket) {
                                if (io.sockets.connected[asocket])
                                    io.sockets.connected[asocket].emit('balance change', itm.amount * 14);
                            });
                        }
                        connection.query('INSERT INTO `wallet_change` SET `user` = ' + connection.escape(itm.player.steamid) + ', `change` = ' + connection.escape(itm.amount * 14) + ', `reason` = \'Roulette #' + currentRollid + ' ' + 'winning!' + '\'', function(err2) {
                            if (err2) {
                                logger.debug('database error at wallet_change');
                                logger.debug(err2);
                                return;
                            }
                        });
                    }
                });
            });
            currentBets['black'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + itm.amount + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) logger.debug('error at total lose increase');
                });
            });
            currentBets['red'].forEach(function(itm) {
                connection.query('UPDATE `users` SET `total_lose` = `total_lose` + ' + itm.amount + ' WHERE `steamid` = ' + connection.escape(itm.player.steamid), function(err) {
                    if (err) logger.debug('error at total lose increase');
                });
            });
        }
    }, 7000);
    connection.query('INSERT INTO `roll_history` SET `roll` = ' + connection.escape(winningNumber) + ', `time` = ' + connection.escape(time()) + ', `hash` = ' + connection.escape(actual_hash));
}

function generateDiceGame(steamid) {
    var sh = sha256(generate(128));
    roll = sh.substr(0, 8);
    roll = parseInt(roll, 16);
    roll = math.abs(roll) % 10000;
    secret = generate(20);
    hash = sha256(roll + ":" + secret);
    user_dice_current[steamid] = dice_games.length;
    dice_games.push({
        "hash": hash,
        "id": dice_games.length,
        "roll": roll,
        "secret": secret
    });
    return hash;
}
function load() {
    connection.query('SET NAMES utf8');
    connection.query('SELECT `id` FROM `roll_history` ORDER BY `id` DESC LIMIT 1', function(err, row) {
        if (err) {
            logger.debug('Can not get number from the last game');
            logger.debug(err);
            process.exit(0);
        }
        if (!row.length) {
            currentRollid = 1;
        } else {
            currentRollid = parseInt(row[0].id) + 1;
        }
    });
    loadHistory();
}

function loadHistory() {
    connection.query('SELECT * FROM `roll_history` ORDER BY `id` LIMIT 10', function(err, row) {
        if (err) {
            logger.debug('Error while loading last rolls history');
            logger.debug(err);
            process.exit(0);
        }
        row.forEach(function(itm) {
            roulette_limit(itm.roll);
        });
    });
    server.listen(3000);
}

function time() {
    return parseInt(new Date().getTime() / 1000)
}

function generate(count) {
    return crypto.randomBytes(count).toString('hex');
}

function array_limit(wartosc) {
    if (chat_history.length == 25) {
        chat_history.shift();
    }
    chat_history.push(wartosc);
}

function roulette_limit(wartosc) {
    if (lastrolls.length == 25) {
        lastrolls.shift();
    }
    lastrolls.push(wartosc);
}

function jp_limit(wartosc) {
    if (jpWinners.length == 10) {
        jpWinners.shift();
    }
    jpWinners.push(wartosc);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
