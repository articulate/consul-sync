const { dirname } = require('path')
const Emitter     = require('events')
const nock        = require('nock')
const qs          = require('querystring')
const URL         = require('url')

const {
  assoc, compose, curry, map, max, merge, partial, pluck, reduce
} = require('ramda')

const { normalizeBy } = require('@articulate/funky')

const kvRegex = /\/v1\/kv\/([^?]+)/
const uri = 'http://consul.io'

const emitter = new Emitter()

const encode = val =>
  new Buffer(val, 'utf8').toString('base64')

const index = item =>
  assoc('ModifyIndex', Date.now(), item)

const init = compose(normalizeBy('Key'), map(index))(require('./kv'))

let KV = merge({}, init)
let waiting = {}

const getKey = curry((recurse, key) => {
  if (!key) {
    return [ 500, {} ]
  }

  const body = recurse === 'true'
    ? recurseKeys(key)
    : [ KV[key] ]

  return body.length
    ? [ 200, body, lastIndex(body) ]
    : [ 404, { message: 'Not found' }, {} ]
})

const lastIndex = body =>
  ({ 'x-consul-index': reduce(max, 0, pluck('ModifyIndex', body)).toString() })

const mockConsul = () =>
  nock(uri)
    .replyContentLength()
    .get(kvRegex)
    .query(true)
    .times(1000)
    .reply(readKey)

const readKey = (uri, body, done) => {
  const { path, query } = URL.parse(uri)
  const key = path.match(kvRegex)[1]
  const { index, recurse } = qs.parse(query)

  const respond = compose(partial(done, [ null ]), getKey(recurse))

  if (!parseInt(index)) {
    respond(key)
  } else {
    waiting = assoc(key, true, waiting)
    emitter.once(key, respond)
  }
}

const recurseKeys = prefix => {
  const prefixed = new RegExp(`^${prefix}`)
  const res = []
  for (let key in KV) if (prefixed.test(key)) res.push(KV[key])
  return res
}

before(() => {
  nock.disableNetConnect()
  mockConsul()
})

afterEach(() =>
  KV = merge({}, init)
)

exports.connect = mockConsul

exports.disconnect = () => {
  nock.cleanAll()

  for (let key in waiting) {
    emitter.emit(key, false)
  }

  waiting = {}
  emitter.removeAllListeners()
}

exports.update = (key, val) => {
  const item = { Key: key, ModifyIndex: Date.now(), Value: encode(val) }
  KV = assoc(key, item, KV)
  emitter.emit(key, key)
  emitter.emit(dirname(key), dirname(key))
}

exports.uri = uri
