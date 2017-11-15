const { basename } = require('path')
const debug        = require('debug')('consul-sync')
const gimme        = require('@articulate/gimme')
const Joi          = require('joi')

const { backoff, mapP, reject, validate } = require('@articulate/funky')

const {
  always, assoc, compose, composeP, curry, curryN, equals, flip, ifElse,
  mergeAll, map, partial, path, pathEq, pick, pipe, prop, reduce, unless
} = require('ramda')

const fiveMin = 300 * 1000

const schema = Joi.object({
  prefixes:   Joi.array().single().items(Joi.string()).default([]),
  retryAfter: Joi.number().min(0).default(5000),
  uri:        Joi.string().uri({ scheme: [ /https?/ ] })
})

const mellow = compose(curryN(2), backoff(250, 4))

const check = curry((opts, index) => {
  const { prefixes, uri } = opts
  return Promise.race(map(wait({ index, uri }), prefixes))
    .then(unless(equals(index), sync(opts)))
    .then(check(opts))
})

const decode = val =>
  new Buffer(val, 'base64').toString('utf8')

const getEnv = mellow(({ uri }, prefix) =>
  gimme({
    data: { consistent: true, recurse: true },
    url: url(uri, prefix)
  }).then(prop('body'))
    .then(reduce(parseEnv, {}))
    .catch(notFound(always({})))
)

const logError = pipe(
  pick(['data', 'message', 'name', 'output', 'stack']),
  JSON.stringify,
  console.error
)

const notFound = flip(ifElse(pathEq(['output', 'statusCode'], 404)))(reject)

const parseEnv = (env, { Key, Value }) =>
  Value === null ? env : assoc(basename(Key), decode(Value), env)

const setEnv = env => {
  Object.assign(process.env, env)
  debug(process.env)
}

const sleep = curry((delay, x) =>
  new Promise(resolve =>
    setTimeout(partial(resolve, [ x ]), delay)
  )
)

const start = opts =>
  check(opts, null)
    .catch(logError)
    .then(sleep(opts.retryAfter))
    .then(partial(start, [ opts ]))

const sync = curry((opts, index) =>
  mapP(getEnv(opts), opts.prefixes)
    .then(mergeAll)
    .then(setEnv)
    .then(always(index))
)

const url = (uri, prefix) =>
  `${uri}/v1/kv/${prefix}`

const wait = mellow(({ index, uri }, prefix) =>
  gimme({
    data: { consistent: true, index, recurse: true },
    url: url(uri, prefix)
  }).then(path(['headers', 'x-consul-index']))
    .catch(notFound(partial(sleep, [ fiveMin, index ])))
)

module.exports = composeP(start, validate(schema))
