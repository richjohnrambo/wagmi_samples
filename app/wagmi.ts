// src/wagmi.ts
import { http, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

// 这里是 Permit2 官方地址，或者你本地部署的测试地址
// 注意：在测试网（例如 Sepolia）上，你需要部署你自己的 Permit2 合约实例
// 如果是本地开发，你需要替换成你本地部署的 Permit2 地址
export const PERMIT2_CONTRACT_ADDRESS = '0x000000000022D473033F530ED68FeCeD7f0C9c0f' as const; // 主网 Permit2 地址示例

export const config = createConfig({
  chains: [mainnet, sepolia], // 根据你的需求添加链
  connectors: [
    injected(),
    metaMask(),
    walletConnect({ projectId: 'YOUR_WALLETCONNECT_PROJECT_ID' }), // 替换为你的 WalletConnect 项目 ID
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})
