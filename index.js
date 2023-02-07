const debug = require('debug')('consul-sync')
const nodeCleanup = require('node-cleanup')

const sync = require('./sync')

const cleanNamespace = (namespace = '') =>
  `${namespace?.toUpperCase?.().replaceAll?.('-', '_') ?? ''}${namespace ? '_' : ''}`

module.exports = async ({prefixes = [], uri}) => {
  const env = {}
  const targets = { '': null }

  switch (typeof prefixes) {
    case 'string':
      targets[''] = prefixes
      break
    case 'object':
      if (Array.isArray(prefixes)) {
        targets[''] = prefixes
      } else {
        Object.assign(targets, prefixes)
      }
  }
  
  const streams = await Promise.all(
    Object.entries(targets)
      .map(([key, value]) => sync({
        namespace: cleanNamespace(key),
        prefixes: value,
        uri,
      }))
  )
  
  streams.forEach(stream => {
    stream.each((updates) => {
      debug(Object.assign(env, updates))
    })
  })
  
  nodeCleanup(() => streams.forEach(stream => stream.destroy()))

  return (key, defaultValue) => key 
    ? env[key] ?? defaultValue
    : env
}
