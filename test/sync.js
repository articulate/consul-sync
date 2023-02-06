const chai = require('chai')
const spies = require('chai-spies')

const waitUntil = require('./util/wait-until')
const consul = require('./consul')

chai.use(spies)

describe('consul-sync', () => {
  context('basic sync', () => {
    beforeEach(async () => {
      const syncs = require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })

      await Promise.all(Object.values(syncs))
    })
  
    beforeEach(waitUntil(() => Boolean(process.env.COLOR)))
    
    afterEach(() => {
      delete process.env.COLOR
      delete process.env.SHA
    })
  
    it('syncs the COLOR to the process.env', () => {
      chai.expect(process.env.COLOR).to.equal('blue')
    })
  
    it('syncs the SHA to the process.env', () => {
      chai.expect(process.env.SHA).to.equal('d2dd5de')
    })
  })

  context('handle new variables', () => {
    beforeEach(async () => {
      const syncs = require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })

      await Promise.all(Object.values(syncs))
    })
  
    beforeEach(() => consul.update('globals/env_vars/FOO', 'bar'))

    beforeEach(waitUntil(() => Boolean(process.env.FOO)))
    
    afterEach(() => {
      delete process.env.COLOR
      delete process.env.SHA
      delete process.env.FOO
    })

    it('updates the process.env', () =>
      chai.expect(process.env.FOO).to.equal('bar')
    )
  })

  context('handle updates to variables', () => {
    beforeEach(async () => {
      const syncs = require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })

      await Promise.all(Object.values(syncs))
    })
  
    beforeEach(() => consul.update('globals/env_vars/COLOR', 'green'))

    beforeEach(waitUntil(() => process.env.COLOR && process.env.COLOR !== 'blue'))
    
    afterEach(() => {
      delete process.env.COLOR
      delete process.env.SHA
    })

    it('updates the process.env', () =>
      chai.expect(process.env.COLOR).to.equal('green')
    )
  })

  context('handle overriding variables', () => {    
    beforeEach(async () => {
      const syncs = require('..')({
        prefixes: [
          'globals/env_vars',
          'products/not-found',
          'services/my-app/env_vars'
        ],
        uri: consul.uri
      })

      await Promise.all(Object.values(syncs))
    })
  
    beforeEach(waitUntil(() => process.env.COLOR && process.env.COLOR !== 'blue'))
    
    afterEach(() => {
      delete process.env.COLOR
      delete process.env.SHA
    })

    it('updates the process.env', () =>
      chai.expect(process.env.COLOR).to.equal('red')
    )
  })

  context('when there are namespaced keys', () => {
    beforeEach(async () => {
      const syncs = require('..')({
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

      await Promise.all(Object.values(syncs))
    })
    
    beforeEach(waitUntil(() => Boolean(process.env.COLOR && process.env.THING_COLOR)))

    afterEach(() => {
      delete process.env.COLOR
      delete process.env.SHA
      delete process.env.THING_COLOR
    })

    it(`loads the namespaced color`, () => {
      chai.expect(process.env.THING_COLOR).to.equal('purple')
    })

    it(`doesn't override the current COLOR`, () => {
      chai.expect(process.env.COLOR).to.equal('red')
    })
  })

  // this is a flaky test. not certain on how to make it more reliable
  context.skip('notify of index out of order', () => {
    beforeEach(async () => {
      const syncs = require('..')({
        prefixes: 'globals/env_vars',
        uri: consul.uri
      })

      await Promise.all(Object.values(syncs))
    })
    
    beforeEach(waitUntil(() => Boolean(process.env.COLOR)))
    beforeEach(async () => {
      chai.spy.on(console, 'info')
      consul.reset()
      await waitUntil(() => console.info.__spy.called)()
    })

    afterEach(() => {
      delete process.env.COLOR
      delete process.env.SHA
    })

    it('updates the process.env', () => {
      chai.expect(console.info).to.have.been.called.with('Consul index out of sync, reset to 0')
    })
  })
})
