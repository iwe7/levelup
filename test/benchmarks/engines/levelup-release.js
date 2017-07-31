/* Copyright (c) 2012-2016 LevelUP contributors
 * See list at <https://github.com/level/levelup#contributing>
 * MIT License <https://github.com/level/levelup/blob/master/LICENSE.md>
 */

var levelup = require('levelup')

var createDb = function (location, callback) {
  levelup(location, { createIfMissing: true }, function (err, db) {
    setTimeout(callback.bind(null, err, db), 50)
  })
}

var closeDb = function (db, callback) {
  db.close(callback)
}

module.exports = {
  createDb: createDb,
  closeDb: closeDb
}
