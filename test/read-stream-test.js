var levelup = require('../lib/levelup.js')
var memdown = require('memdown')
var encDown = require('encoding-down')
var common = require('./common')
var assert = require('referee').assert
var refute = require('referee').refute
var buster = require('bustermove')
var bigBlob = Array.apply(null, Array(1024 * 100)).map(function () { return 'aaaaaaaaaa' }).join('')

buster.testCase('ReadStream', {
  'setUp': common.readStreamSetUp,

  'tearDown': common.commonTearDown,

  // TODO: test various encodings

  'test simple ReadStream': function (done) {
    this.openTestDatabase(function (db) {
      // execute
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))
      }.bind(this))
    }.bind(this))
  },

  'test pausing': function (done) {
    var calls = 0
    var rs
    var pauseVerify = function () {
      assert.equals(calls, 5, 'stream should still be paused')
      rs.resume()
      pauseVerify['called'] = true
    }
    var onData = function () {
      if (++calls === 5) {
        rs.pause()
        setTimeout(pauseVerify, 50)
      }
    }
    var verify = function () {
      assert.equals(calls, this.sourceData.length, 'onData was used in test')
      assert(pauseVerify['called'], 'pauseVerify was used in test')
      this.verify(rs, done)
    }.bind(this)

    this.dataSpy = this.spy(onData) // so we can still verify

    this.openTestDatabase(function (db) {
      // execute
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        rs = db.createReadStream()
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('end', verify.bind(this))
      }.bind(this))
    }.bind(this))
  },

  'test destroy() immediately': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', function () {
          assert.equals(this.dataSpy.callCount, 0, '"data" event was not fired')
          assert.equals(this.endSpy.callCount, 0, '"end" event was not fired')
          done()
        }.bind(this))
        rs.destroy()
      }.bind(this))
    }.bind(this))
  },

  'test destroy() after close': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', function () {
          rs.destroy()
          done()
        })
      }.bind(this))
    }.bind(this))
  },

  'test destroy() after closing db': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)
        db.close(function (err) {
          refute(err)
          var rs = db.createReadStream()
          rs.destroy()
          done()
        })
      })
    }.bind(this))
  },

  'test destroy() twice': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        rs.on('data', function () {
          rs.destroy()
          rs.destroy()
          done()
        })
      })
    }.bind(this))
  },

  'test destroy() half way through': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        var endSpy = this.spy()
        var calls = 0
        this.dataSpy = this.spy(function () {
          if (++calls === 5) { rs.destroy() }
        })
        rs.on('data', this.dataSpy)
        rs.on('end', endSpy)
        rs.on('close', function () {
          // should do "data" 5 times ONLY
          assert.equals(this.dataSpy.callCount, 5, 'ReadStream emitted correct number of "data" events (5)')
          this.sourceData.slice(0, 5).forEach(function (d, i) {
            var call = this.dataSpy.getCall(i)
            assert(call)
            if (call) {
              assert.equals(call.args.length, 1, 'ReadStream "data" event #' + i + ' fired with 1 argument')
              refute.isNull(call.args[0].key, 'ReadStream "data" event #' + i + ' argument has "key" property')
              refute.isNull(call.args[0].value, 'ReadStream "data" event #' + i + ' argument has "value" property')
              assert.equals(call.args[0].key, d.key, 'ReadStream "data" event #' + i + ' argument has correct "key"')
              assert.equals(+call.args[0].value, +d.value, 'ReadStream "data" event #' + i + ' argument has correct "value"')
            }
          }.bind(this))
          done()
        }.bind(this))
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "reverse=true"': function (done) {
    this.openTestDatabase(function (db) {
      // execute
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ reverse: true })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData.reverse() // for verify
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "start"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: '50' })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // slice off the first 50 so verify() expects only the last 50 even though all 100 are in the db
        this.sourceData = this.sourceData.slice(50)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "start" and "reverse=true"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: '50', reverse: true })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // reverse and slice off the first 50 so verify() expects only the first 50 even though all 100 are in the db
        this.sourceData.reverse()
        this.sourceData = this.sourceData.slice(49)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "start" being mid-way key (float)': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        // '49.5' doesn't actually exist but we expect it to start at '50' because '49' < '49.5' < '50' (in string terms as well as numeric)
        var rs = db.createReadStream({ start: '49.5' })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // slice off the first 50 so verify() expects only the last 50 even though all 100 are in the db
        this.sourceData = this.sourceData.slice(50)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "start" being mid-way key (float) and "reverse=true"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: '49.5', reverse: true })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // reverse & slice off the first 50 so verify() expects only the first 50 even though all 100 are in the db
        this.sourceData.reverse()
        this.sourceData = this.sourceData.slice(50)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "start" being mid-way key (string)': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        // '499999' doesn't actually exist but we expect it to start at '50' because '49' < '499999' < '50' (in string terms)
        // the same as the previous test but we're relying solely on string ordering
        var rs = db.createReadStream({ start: '499999' })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // slice off the first 50 so verify() expects only the last 50 even though all 100 are in the db
        this.sourceData = this.sourceData.slice(50)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "end"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: '50' })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // slice off the last 49 so verify() expects only 0 -> 50 inclusive, even though all 100 are in the db
        this.sourceData = this.sourceData.slice(0, 51)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "end" being mid-way key (float)': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: '50.5' })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // slice off the last 49 so verify() expects only 0 -> 50 inclusive, even though all 100 are in the db
        this.sourceData = this.sourceData.slice(0, 51)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "end" being mid-way key (string)': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: '50555555' })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // slice off the last 49 so verify() expects only 0 -> 50 inclusive, even though all 100 are in the db
        this.sourceData = this.sourceData.slice(0, 51)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "end" being mid-way key (float) and "reverse=true"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: '50.5', reverse: true })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData.reverse()
        this.sourceData = this.sourceData.slice(0, 49)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with both "start" and "end"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: 30, end: 70 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // should include 30 to 70, inclusive
        this.sourceData = this.sourceData.slice(30, 71)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with both "start" and "end" and "reverse=true"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: 70, end: 30, reverse: true })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        // expect 70 -> 30 inclusive
        this.sourceData.reverse()
        this.sourceData = this.sourceData.slice(29, 70)
      }.bind(this))
    }.bind(this))
  },

  'test hex encoding': function (done) {
    var options = { keyEncoding: 'utf8', valueEncoding: 'hex' }
    var data = [
      { type: 'put', key: 'ab', value: 'abcdef0123456789' }
    ]

    this.openTestDatabase({}, function (db) {
      db.batch(data.slice(), options, function (err) {
        refute(err)

        var rs = db.createReadStream(options)
        rs.on('data', function (data) {
          assert.equals(data.value, 'abcdef0123456789')
        })
        rs.on('end', this.endSpy)
        rs.on('close', done)
      }.bind(this))
    }.bind(this))
  },

  'test json encoding': function (done) {
    var options = { keyEncoding: 'utf8', valueEncoding: 'json' }
    var data = [
      { type: 'put', key: 'aa', value: { a: 'complex', obj: 100 } },
      { type: 'put', key: 'ab', value: { b: 'foo', bar: [ 1, 2, 3 ] } },
      { type: 'put', key: 'ac', value: { c: 'w00t', d: { e: [ 0, 10, 20, 30 ], f: 1, g: 'wow' } } },
      { type: 'put', key: 'ba', value: { a: 'complex', obj: 100 } },
      { type: 'put', key: 'bb', value: { b: 'foo', bar: [ 1, 2, 3 ] } },
      { type: 'put', key: 'bc', value: { c: 'w00t', d: { e: [ 0, 10, 20, 30 ], f: 1, g: 'wow' } } },
      { type: 'put', key: 'ca', value: { a: 'complex', obj: 100 } },
      { type: 'put', key: 'cb', value: { b: 'foo', bar: [ 1, 2, 3 ] } },
      { type: 'put', key: 'cc', value: { c: 'w00t', d: { e: [ 0, 10, 20, 30 ], f: 1, g: 'wow' } } }
    ]

    this.openTestDatabase(options, function (db) {
      db.batch(data.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done, data))
      }.bind(this))
    }.bind(this))
  },

  'test injectable encoding': function (done) {
    var options = {
      keyEncoding: 'utf8',
      valueEncoding: {
        encode: JSON.stringify,
        decode: JSON.parse,
        buffer: false
      }}
    var data = [
      { type: 'put', key: 'aa', value: { a: 'complex', obj: 100 } },
      { type: 'put', key: 'ab', value: { b: 'foo', bar: [ 1, 2, 3 ] } },
      { type: 'put', key: 'ac', value: { c: 'w00t', d: { e: [ 0, 10, 20, 30 ], f: 1, g: 'wow' } } },
      { type: 'put', key: 'ba', value: { a: 'complex', obj: 100 } },
      { type: 'put', key: 'bb', value: { b: 'foo', bar: [ 1, 2, 3 ] } },
      { type: 'put', key: 'bc', value: { c: 'w00t', d: { e: [ 0, 10, 20, 30 ], f: 1, g: 'wow' } } },
      { type: 'put', key: 'ca', value: { a: 'complex', obj: 100 } },
      { type: 'put', key: 'cb', value: { b: 'foo', bar: [ 1, 2, 3 ] } },
      { type: 'put', key: 'cc', value: { c: 'w00t', d: { e: [ 0, 10, 20, 30 ], f: 1, g: 'wow' } } }
    ]

    this.openTestDatabase(options, function (db) {
      db.batch(data.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done, data))
      }.bind(this))
    }.bind(this))
  },

  'test readStream() "reverse=true" not sticky (issue #6)': function (done) {
    this.openTestDatabase(function (db) {
      // execute
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)
        // read in reverse, assume all's good
        var rs = db.createReadStream({ reverse: true })
        rs.on('close', function () {
          // now try reading the other way
          var rs = db.createReadStream()
          rs.on('data', this.dataSpy)
          rs.on('end', this.endSpy)
          rs.on('close', this.verify.bind(this, rs, done))
        }.bind(this))
        rs.resume()
      }.bind(this))
    }.bind(this))
  },

  'test ReadStream, start=0': function (done) {
    this.openTestDatabase(function (db) {
      // execute
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: 0 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))
      }.bind(this))
    }.bind(this))
  },

  // we don't expect any data to come out of here because the keys start at '00' not 0
  // we just want to ensure that we don't kill the process
  'test ReadStream, end=0': function (done) {
    this.openTestDatabase(function (db) {
      // execute
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: 0 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData = []
      }.bind(this))
    }.bind(this))
  },

  // this is just a fancy way of testing levelup(db).createReadStream()
  // i.e. not waiting for 'open' to complete
  // the logic for this is inside the ReadStream constructor which waits for 'ready'
  'test ReadStream on pre-opened db': function (done) {
    var db = levelup(encDown(memdown()))
    var execute = function () {
      // is in limbo
      refute(db.isOpen())
      refute(db.isClosed())

      var rs = db.createReadStream()
      rs.on('data', this.dataSpy)
      rs.on('end', this.endSpy)
      rs.on('close', this.verify.bind(this, rs, done))
    }.bind(this)
    var setup = function () {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)
        db.close(function (err) {
          refute(err)

          var async = true
          db.open(function (err) {
            async = false
            refute(err, 'no open error')
          })

          execute()

          // Should open lazily
          assert(async)
        })
      })
    }.bind(this)

    setup()
  },

  'test readStream() with "limit"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ limit: 20 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData = this.sourceData.slice(0, 20)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "start" and "limit"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ start: '20', limit: 20 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData = this.sourceData.slice(20, 40)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "end" after "limit"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: '50', limit: 20 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData = this.sourceData.slice(0, 20)
      }.bind(this))
    }.bind(this))
  },

  'test readStream() with "end" before "limit"': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream({ end: '30', limit: 50 })
        rs.on('data', this.dataSpy)
        rs.on('end', this.endSpy)
        rs.on('close', this.verify.bind(this, rs, done))

        this.sourceData = this.sourceData.slice(0, 31)
      }.bind(this))
    }.bind(this))
  },

  // can, fairly reliably, trigger a core dump if next/end isn't
  // protected properly
  // the use of large blobs means that next() takes time to return
  // so we should be able to slip in an end() while it's working
  'test iterator next/end race condition': function (done) {
    var data = []
    var i = 5
    var v

    while (i--) {
      v = bigBlob + i
      data.push({ type: 'put', key: v, value: v })
    }

    this.openTestDatabase(function (db) {
      db.batch(data, function (err) {
        refute(!!err)
        var rs = db.createReadStream().on('close', done)
        rs.once('data', function () {
          rs.destroy()
        })
      })
    })
  },

  'test can only end once': function (done) {
    this.openTestDatabase(function (db) {
      db.batch(this.sourceData.slice(), function (err) {
        refute(err)

        var rs = db.createReadStream()
          .on('close', done)

        process.nextTick(function () {
          rs.destroy()
        })
      })
    }.bind(this))
  }
})
