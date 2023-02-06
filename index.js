const sync = require('./sync')

const cleanNamespace = (namespace = '') =>
  `${namespace?.toUpperCase?.().replaceAll?.('-', '_') ?? ''}${namespace ? '_' : ''}`

module.exports = async ({prefixes = [], uri}) => {
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
  
  return Object.fromEntries(Object.entries(targets)
    .map(([key, value]) => [key, sync({
      namespace: cleanNamespace(key),
      prefixes: value,
      uri,
    })]))
}
