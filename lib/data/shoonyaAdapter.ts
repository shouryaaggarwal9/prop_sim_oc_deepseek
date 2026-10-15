/**
 * Shoonya (Finvasia) Free API Adapter
 * 
 * Shoonya provides 100% free lifetime REST and WebSocket market data (Zero API charges, zero brokerage).
 * How to get credentials:
 * 1. Open a free Shoonya Finvasia account at shoonya.com
 * 2. Generate API Key from the Shoonya Prism portal
 * 3. Add credentials in your .env or Settings modal in the app
 */

export interface ShoonyaCredentials {
  userId: string;
  apiKey: string;
  vendorCode: string;
  imei?: string;
  totpSecret: string;
}

export interface ShoonyaCandle {
  stat: string;
  time: string;
  into: number; // open
  inth: number; // high
  intl: number; // low
  intc: number; // close
  v: number;    // volume
  oi: number;   // open interest
}

export class ShoonyaApiConnector {
  private baseUrl = 'https://api.shoonya.com/NorenWClientTP/';
  private userToken: string | null = null;
  private isConnected: boolean = false;

  constructor(private credentials?: ShoonyaCredentials) {}

  /**
   * Check connection status
   */
  public getStatus() {
    return {
      isConfigured: !!(this.credentials?.userId && this.credentials?.apiKey),
      isConnected: this.isConnected,
      provider: 'Shoonya (Finvasia) Zero-Brokerage Free API',
    };
  }

  /**
   * Authenticate session with Shoonya using SHA256 hashed password and TOTP
   */
  public async authenticate(passwordHash: string, totpCode: string): Promise<boolean> {
    if (!this.credentials) return false;

    try {
      const payload = {
        apkversion: 'js:1.0.0',
        uid: this.credentials.userId,
        pwd: passwordHash,
        factor2: totpCode,
        vc: this.credentials.vendorCode,
        appkey: this.credentials.apiKey,
        imei: this.credentials.imei || 'WEB_SIMULATOR',
      };

      // In client/mock mode or server route:
      const res = await fetch(`${this.baseUrl}QuickAuth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.stat === 'Ok' && data.susertoken) {
        this.userToken = data.susertoken;
        this.isConnected = true;
        return true;
      }
      return false;
    } catch (e) {
      console.error('Shoonya Authentication Failed:', e);
      return false;
    }
  }

  /**
   * Fetch 1-Minute Historical Candles for Nifty/Bank Nifty F&O
   */
  public async getMinuteCandles(
    exchange: 'NSE' | 'NFO',
    token: string,
    startTime: string,
    endTime: string
  ): Promise<ShoonyaCandle[]> {
    if (!this.userToken) {
      throw new Error('Not authenticated with Shoonya');
    }

    const payload = {
      uid: this.credentials?.userId,
      exch: exchange,
      token,
      st: startTime,
      et: endTime,
      intrv: '1', // 1-minute interval
    };

    const res = await fetch(`${this.baseUrl}TPSeries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.userToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
}
