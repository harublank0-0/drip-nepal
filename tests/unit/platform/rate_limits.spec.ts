import { test } from '@japa/runner'
import { clientNetwork, rateLimitKey } from '#modules/platform/rate_limits'

/*
 * T-SEC-011, the grouping of docs/06 §9.1 and docs/07 §3.6: the client
 * network that every IP-keyed limiter key is built from. IPv4 as is, an
 * IPv4-mapped IPv6 address as its IPv4 address, any other IPv6 address as
 * its /64. T-SEC-101: the hashed key has a fixed length.
 */

test.group('T-SEC-011 the client network of a limiter key', () => {
  test('{ip} → {network}')
    .with([
      { ip: '203.0.113.7', network: '203.0.113.7' },
      { ip: '::ffff:203.0.113.7', network: '203.0.113.7' },
      { ip: '::FFFF:cb00:7107', network: '203.0.113.7' },
      { ip: '2001:db8:1:2:3:4:5:6', network: '2001:db8:1:2::/64' },
      { ip: '2001:db8:1:2::9', network: '2001:db8:1:2::/64' },
      { ip: '2001:0DB8:0001:0002::', network: '2001:db8:1:2::/64' },
      { ip: '2001:db8::1', network: '2001:db8:0:0::/64' },
      { ip: '2001:db8:1:2::1.2.3.4', network: '2001:db8:1:2::/64' },
      { ip: '::1', network: '0:0:0:0::/64' },
      { ip: 'fe80::1%eth0', network: 'fe80:0:0:0::/64' },
      { ip: 'not-an-address', network: 'not-an-address' },
    ])
    .run(({ assert }, { ip, network }) => {
      assert.equal(clientNetwork(ip), network)
    })

  test('two hosts of one /64 share a key; the next /64 does not', ({ assert }) => {
    const key = (ip: string) => rateLimitKey('login_ip', clientNetwork(ip))
    assert.equal(key('2001:db8:aa:bb::1'), key('2001:db8:aa:bb:ffff:ffff:ffff:fffe'))
    assert.notEqual(key('2001:db8:aa:bb::1'), key('2001:db8:aa:bc::1'))
  })
})

test.group('T-SEC-101 limiter keys have a fixed length', () => {
  test('a 254-character email and an IPv6 address give a 64-hex key', ({ assert }) => {
    const email = `${'a'.repeat(242)}@example.com`
    assert.lengthOf(email, 254)
    const key = rateLimitKey('login_acct_ip', email, clientNetwork('2001:db8:1:2:3:4:5:6'))
    assert.match(key, /^login:acct_ip:[0-9a-f]{64}$/)
    assert.notInclude(key, 'example.com')
  })
})
