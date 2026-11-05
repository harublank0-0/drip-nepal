import env from '#start/env'

// A browser over HTTP to the test server: keeps cookies, sends the XSRF
// token, and asks for pages the way Inertia does, as JSON.
export class Browser {
  #cookies = new Map<string, string>()
  #inertiaVersion = ''
  constructor(private base: string) {}

  #headers() {
    return {
      'Cookie': [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      'X-XSRF-TOKEN': decodeURIComponent(this.#cookies.get('XSRF-TOKEN') ?? ''),
    }
  }

  #remember(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.slice(0, cookie.indexOf(';'))
      const at = pair.indexOf('=')
      this.#cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }

  // Opens a page as a first visit does, and keeps the page's Inertia version
  // (it differs by build), which later JSON requests must send.
  async open(path: string) {
    const response = await fetch(`${this.base}${path}`, {
      redirect: 'manual',
      headers: this.#headers(),
    })
    this.#remember(response)
    const html = await response.text()
    const version = html.match(/(?:"|&quot;)version(?:"|&quot;):(?:"|&quot;)([^"&]*)/)
    if (!version) throw new Error(`${path} answered ${response.status} with no Inertia page`)
    this.#inertiaVersion = version[1]
  }

  async post(path: string, body: unknown) {
    const response = await fetch(`${this.base}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...this.#headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    this.#remember(response)
    return response
  }

  async props(path: string) {
    const response = await fetch(`${this.base}${path}`, {
      redirect: 'manual',
      headers: {
        ...this.#headers(),
        'X-Inertia': 'true',
        'X-Inertia-Version': this.#inertiaVersion,
      },
    })
    this.#remember(response)
    if (response.status !== 200) throw new Error(`${path} answered ${response.status}`)
    const page = (await response.json()) as { component: string; props: Record<string, unknown> }
    return page.props
  }
}

// A browser on the test server.
export function testBrowser() {
  return new Browser(`http://${env.get('HOST')}:${env.get('PORT')}`)
}
