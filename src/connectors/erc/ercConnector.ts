import { AbstractConnectorArguments, ConnectorUpdate } from '@web3-react/types'
import { AbstractConnector } from '@web3-react/abstract-connector'
import warning from 'tiny-warning'

import { SendReturnResult, SendReturn, Send, SendOld } from './types'

function parseSendReturn(sendReturn: SendReturnResult | SendReturn): any {
  // eslint-disable-next-line no-prototype-builtins
  return sendReturn.hasOwnProperty('result') ? sendReturn.result : sendReturn
}

export class NoErcProviderError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'No ERC provider was found on window.EthereumChain.'
  }
}

export class UserRejectedRequestError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'The user rejected the request.'
  }
}

export class ErcConnector extends AbstractConnector {
  constructor(kwargs: AbstractConnectorArguments) {
    super(kwargs)

    this.handleNetworkChanged = this.handleNetworkChanged.bind(this)
    this.handleChainChanged = this.handleChainChanged.bind(this)
    this.handleAccountsChanged = this.handleAccountsChanged.bind(this)
    this.handleClose = this.handleClose.bind(this)
  }

  private handleChainChanged(chainId: string | number): void {
    this.emitUpdate({ chainId, provider: window.EthereumChain })
  }

  private handleAccountsChanged(accounts: string[]): void {
    if (accounts.length === 0) {
      this.emitDeactivate()
    } else {
      this.emitUpdate({ account: accounts[0] })
    }
  }

  private handleClose(): void {
    this.emitDeactivate()
  }

  private handleNetworkChanged(networkId: string | number): void {
    this.emitUpdate({ chainId: networkId, provider: window.EthereumChain })
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!window.EthereumChain) {
      throw new NoErcProviderError()
    }

    if (window.EthereumChain.on) {
      window.EthereumChain.on('chainChanged', this.handleChainChanged)
      window.EthereumChain.on('accountsChanged', this.handleAccountsChanged)
      window.EthereumChain.on('close', this.handleClose)
      window.EthereumChain.on('networkChanged', this.handleNetworkChanged)
    }

    if ((window.EthereumChain as any).isMetaMask) {
      (window.EthereumChain as any).autoRefreshOnNetworkChange = false
    }

    // try to activate + get account via eth_requestAccounts
    let account
    try {
      account = await (window.EthereumChain.send as Send)('eth_requestAccounts').then(
        (sendReturn) => parseSendReturn(sendReturn)[0]
      )
    } catch (error) {
      if ((error as any).code === 4001) {
        throw new UserRejectedRequestError()
      }
      warning(false, 'eth_requestAccounts was unsuccessful, falling back to enable')
    }

    // if unsuccessful, try enable
    if (!account) {
      // if enable is successful but doesn't return accounts, fall back to getAccount (not happy i have to do this...)
      account = await window.EthereumChain.enable().then((sendReturn) => sendReturn && parseSendReturn(sendReturn)[0])
    }

    return { provider: window.EthereumChain, ...(account ? { account } : {}) }
  }

  public async getProvider(): Promise<any> {
    return window.EthereumChain
  }

  public async getChainId(): Promise<number | string> {
    if (!window.EthereumChain) {
      throw new NoErcProviderError()
    }

    let chainId
    try {
      chainId = await (window.EthereumChain.send as Send)('eth_chainId').then(parseSendReturn)
    } catch {
      warning(false, 'eth_chainId was unsuccessful, falling back to net_version')
    }

    if (!chainId) {
      try {
        chainId = await (window.EthereumChain.send as Send)('net_version').then(parseSendReturn)
      } catch {
        warning(false, 'net_version was unsuccessful, falling back to net version v2')
      }
    }

    if (!chainId) {
      try {
        chainId = parseSendReturn((window.EthereumChain.send as SendOld)({ method: 'net_version' }))
      } catch {
        warning(false, 'net_version v2 was unsuccessful, falling back to manual matches and static properties')
      }
    }

    if (!chainId) {
      if ((window.EthereumChain as any).isDapper) {
        chainId = parseSendReturn((window.EthereumChain as any).cachedResults.net_version)
      } else {
        chainId =
          (window.EthereumChain as any).chainId ||
          (window.EthereumChain as any).netVersion ||
          (window.EthereumChain as any).networkVersion ||
          (window.EthereumChain as any)._chainId
      }
    }

    return chainId
  }

  public async getAccount(): Promise<null | string> {
    if (!window.EthereumChain) {
      throw new NoErcProviderError()
    }

    let account
    try {
      account = await (window.EthereumChain.send as Send)('eth_accounts').then(
        (sendReturn) => parseSendReturn(sendReturn)[0]
      )
    } catch {
      warning(false, 'eth_accounts was unsuccessful, falling back to enable')
    }

    if (!account) {
      try {
        account = await window.EthereumChain.enable().then((sendReturn) => parseSendReturn(sendReturn)[0])
      } catch {
        warning(false, 'enable was unsuccessful, falling back to eth_accounts v2')
      }
    }

    if (!account) {
      account = parseSendReturn((window.EthereumChain.send as SendOld)({ method: 'eth_accounts' }))[0]
    }

    return account
  }

  public deactivate() {
    if (window.EthereumChain && window.EthereumChain.removeListener) {
      window.EthereumChain.removeListener('chainChanged', this.handleChainChanged)
      window.EthereumChain.removeListener('accountsChanged', this.handleAccountsChanged)
      window.EthereumChain.removeListener('close', this.handleClose)
      window.EthereumChain.removeListener('networkChanged', this.handleNetworkChanged)
    }
  }

  public async isAuthorized(): Promise<boolean> {
    if (!window.EthereumChain) {
      return false
    }

    try {
      return await (window.EthereumChain.send as Send)('eth_accounts').then((sendReturn) => {
        if (parseSendReturn(sendReturn).length > 0) {
          return true
        }
        return false
      })
    } catch {
      return false
    }
  }
}
