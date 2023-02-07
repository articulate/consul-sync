const chai = require('chai')
const spies = require('chai-spies')

const waitUntil = require('./util/wait-until')
const consul = require('./consul')

chai.use(spies)

describe('consul-sync', () => {
  context('basic sync', () => {
    let getConfig

    beforeEach(async () => {
      getConfig = await require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })
    })
  
    beforeEach(waitUntil(() => Boolean(getConfig('COLOR'))))
  
    it('syncs the COLOR from consul', () => {
      chai.expect(getConfig('COLOR')).to.equal('blue')
    })
  
    it('syncs the SHA from consul', () => {
      chai.expect(getConfig('SHA')).to.equal('d2dd5de')
    })
  })

  context('handle new variables', () => {
    let getConfig

    beforeEach(async () => {
      getConfig = await require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })
    })
  
    beforeEach(() => consul.update('globals/env_vars/FOO', 'bar'))

    beforeEach(waitUntil(() => getConfig('FOO')))

    it('adds the new key', () =>
      chai.expect(getConfig('FOO')).to.equal('bar')
    )
  })

  context('handle updates to variables', () => {
    let getConfig

    beforeEach(async () => {
      getConfig = await require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })
    })
  
    beforeEach(() => consul.update('globals/env_vars/COLOR', 'green'))

    beforeEach(waitUntil(() => getConfig('COLOR') && getConfig('COLOR') !== 'blue'))

    it('updates the current COLOR', () =>
      chai.expect(getConfig('COLOR')).to.equal('green')
    )
  })

  context('handle overriding variables', () => {  
    let getConfig

    beforeEach(async () => {
      getConfig = await require('..')({
        prefixes: [
          'globals/env_vars',
          'products/not-found',
          'services/my-app/env_vars'
        ],
        uri: consul.uri
      })
    })
  
    beforeEach(waitUntil(() => getConfig('COLOR') && getConfig('COLOR') !== 'blue'))

    it('overrides the current COLOR with a higher priority prefix', () =>
      chai.expect(getConfig('COLOR')).to.equal('red')
    )
  })

  context('when there are namespaced keys', () => {
    let getConfig

    beforeEach(async () => {
      getConfig = await require('..')({
        prefixes: {
          '': [
            'globals/env_vars',
            'products/not-found',
            'services/my-app/env_vars',
          ],
          thing: 'services/another-app/env_vars',
        },
        uri: consul.uri
      })
    })
    
    beforeEach(waitUntil(() => Boolean(getConfig('COLOR') && getConfig('THING_COLOR'))))

    it(`loads the namespaced COLOR`, () => {
      chai.expect(getConfig('THING_COLOR')).to.equal('purple')
    })

    it(`doesn't override the current COLOR`, () => {
      chai.expect(getConfig('COLOR')).to.equal('red')
    })
  })
})
