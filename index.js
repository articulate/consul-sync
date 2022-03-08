const _ = require('highland')
const { basename } = require('path')
const { backoff, validate } = require('@articulate/funky')
const axios = require('axios')
const debug = require('debug')('consul-sync')
const Joi = require('joi')

const {
  append,
  assoc,
  composeP,
  map,
  mergeAll,
  path,
  pipe,
  reduce,
} = require('ramda')

const BASE_WAIT = 10
const CONSUL_WAIT = `${BASE_WAIT}m`
const AXIOS_TIMEOUT = BASE_WAIT * 60 * 1000 + 10000 // 10m + 10s

const logger = {
  info: pipe(JSON.stringify, console.log),
  error: pipe(JSON.stringify, console.error),
}

const schema = Joi.object({
  prefixes: Joi.array().single().items(Joi.string()).default([]),
  uri: Joi.string().uri({ scheme: [ /https?/ ] }),
})

const buildUrl = (uri, prefix) => `${uri}/v1/kv/${prefix}`
const getIndex = path([ 'headers', 'x-consul-index' ])

const parseEnv = (env, { Key, Value }) =>
  Value === null ? env : assoc(basename(Key), decode(Value), env)

const parseEnvs = reduce(parseEnv, {})
const decode = val => Buffer.from(val, 'base64').toString('utf8')

const setEnv = env => {
  Object.assign(process.env, env)
  debug(env)
}

const getNextIndex = (previousIndex, nextIndex) =>
  parseInt(nextIndex) > parseInt(previousIndex) ? 0 : nextIndex

const hasIndexIncreased = (previousIndex, nextIndex) =>
  parseInt(nextIndex) > parseIndex(previousIndex)

const fetch = async (uri, prefix, index) => {
  const prefixUrl = buildUrl(uri, prefix)

  const response = await axios.get(prefixUrl, {
    params: {
      consistent: true,
      index,
      recurse: true,
      wait: CONSUL_WAIT,
    },
    timeout: AXIOS_TIMEOUT
  })

  const { data, request } = response

  return {
    requestUrl: request.res.responseUrl,
    data,
    previousIndex: index,
    nextIndex: getIndex(response)
  }
}

const fetchWithBackoff =  backoff({ tries: 10 }, fetch)

const monitor = uri => prefix => {
  let index = 0

  return _(async (push, next) => {
    try {
      const {
        data,
        previousIndex,
        nextIndex,
        requestUrl,
      } = await fetchWithBackoff(uri, prefix, index)

      index = getNextIndex(previousIndex, nextIndex)

      if (hasIndexIncreased(previousIndex, nextIndex)) {
        logger.info({
          index,
          prefix,
          requestUrl,
          requestIndex: previousIndex,
          responseIndex: nextIndex,
        }, 'Consul syncing. Env changed recieved')

        const envVars = parseEnvs(data)
        push(null, { envVars, prefix })
      }
    } catch (error) {
      logger.error({ error, info: { index } }, 'Consul syncing error')
      index = 0
    }

    next()
  })
}

const orderReducer = obj => (acc, key) => {
  if (!obj[key]) {
    return acc
  }

  return append(obj[key], acc)
}

const orderVals = (orderedKeys, obj) =>
  reduce(orderReducer(obj), [], orderedKeys)

const initializeEnvsCache = () => {
  const prefixedEnvs = {}

  return (prefix, env) => {
    prefixedEnvs[prefix] = env
    return prefixedEnvs
  }
}

const buildEnv = (orderedPrefixes, envCache) => {
  const orderedEnvs = orderVals(orderedPrefixes, envCache)
  return mergeAll(orderedEnvs)
}

const updateEnv = prefixes => {
  const updateEnvCache = initializeEnvsCache()

  return ({ prefix, envVars }) => {
    const envCache = updateEnvCache(prefix, envVars)
    setEnv(buildEnv(prefixes, envCache))
  }
}

const consulSync = ({ prefixes, uri }) =>
  _(map(monitor(uri), prefixes))
    .merge()
    .each(updateEnv(prefixes))

module.exports = composeP(consulSync, validate(schema))

