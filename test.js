'use strict'

var test = require('tape')
var hapi = require('hapi')
var boom = require('boom')
var semver = require('semver')
var proxyquire = require('proxyquire')

var hapiVersion = semver.major(require('hapi/package.json').version)

test('options', function (t) {
  t.plan(2)

  var server = Server()
  var plugin = proxyquire('./', {
    raven: {
      Client: function (dsn, options) {
        t.equal(dsn, 'dsn')
        t.deepEqual(options, {foo: 'bar'})
      }
    }
  })

  register(server, plugin, {
    dsn: 'dsn',
    client: {foo: 'bar'}
  })
})

test('request-error', function (t) {
  t.plan(10)

  var server = Server()
  var plugin = proxyquire('./', {
    raven: {
      Client: function (dsn, options) {
        return {
          captureException: function (err, data) {
            t.equal(err.message, 'unexpected')
            t.ok(data.extra)
            t.equal(typeof data.extra.timestamp, 'number')
            t.equal(typeof data.extra.id, 'string')
            t.equal(data.request.method, 'get')
            t.equal(data.extra.path, '/')
            t.deepEqual(data.extra.query, {})
            t.equal(data.extra.remoteAddress, hapiVersion === 8 ? '' : '127.0.0.1')
            t.equal(data.extra.userAgent, 'shot')
          }
        }
      }
    }
  })

  register(server, plugin, {})

  server.inject('/', function (response) {
    t.equal(response.statusCode, 500)
  })
})

test('boom error', function (t) {
  t.plan(1)

  var server = Server()
  var plugin = proxyquire('./', {
    raven: {
      Client: function (dsn, options) {
        return {
          captureException: t.fail
        }
      }
    }
  })

  register(server, plugin, {})

  server.inject('/boom', function (response) {
    t.equal(response.statusCode, 403)
  })
})

test('tags', function (t) {
  t.plan(3)

  var server = Server()
  var plugin = proxyquire('./', {
    raven: {
      Client: function (dsn, options) {
        return {
          captureException: function (err, data) {
            t.ok(err)
            t.deepEqual(data.tags, ['beep'])
          }
        }
      }
    }
  })

  register(server, plugin, {tags: ['beep']})

  server.inject('/', function (response) {
    t.equal(response.statusCode, 500)
  })
})

function Server () {
  var server = new hapi.Server()
  server.connection()

  server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
      reply(new Error('unexpected'))
    }
  })

  server.route({
    method: 'GET',
    path: '/boom',
    handler: function (request, reply) {
      reply(boom.forbidden())
    }
  })

  return server
}

function register (server, plugin, options) {
  server.register({
    register: plugin,
    options: options || {
      dsn: 'dsn'
    }
  }, function (err) {
    if (err) throw err
  })
}
