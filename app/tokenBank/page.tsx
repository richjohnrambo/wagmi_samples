// app/your-tokenbank-route/page.tsx (示例路径)

"use client"; // 明确这是一个客户端组件

import React, { useState, useEffect } from 'react';
import {
    useAccount,
    useDisconnect,
    useChainId,
    useReadContract,
    useWriteContract,
    usePublicClient
} from 'wagmi';
import { type Address, parseUnits, formatUnits } from 'viem';
import { useQuery } from '@tanstack/react-query'; // 从 React Query 导入 useQuery
import { useAppKit } from '@reown/appkit/react'; // 从 AppKit 导入 useAppKit

// 导入 AppKitProvider
import { AppKitProvider } from './tokenBank-config'; // 根据你的实际文件路径调整导入
// 从 ethers 库中导入 Provider 和 custom 模块
import { JsonRpcProvider } from 'ethers';
// --- Permit2 SDK 核心导入 ---
import { AllowanceProvider, AllowanceTransfer, PERMIT2_ADDRESS } from '@uniswap/permit2-sdk';
import { MaxAllowanceTransferAmount, PermitSingle } from '@uniswap/permit2-sdk';
import TOKEN_BANK_ABI from '../contracts/TokenBank.json' with { type: 'json' };
import MY_ERC20_ABI from '../contracts/MyERC20.json' with { type: 'json' };
// 导入 viemToEthersProvider 工具函数
 

// --- 合约地址和 ABI 定义 ---

export const PERMIT2_ABI = [
    {
        inputs: [
            { internalType: 'address', name: '', type: 'address' },
            { internalType: 'address', name: '', type: 'address' },
            { internalType: 'address', name: '', type: 'address' },
        ],
        name: 'allowance',
        outputs: [
            { internalType: 'uint160', name: 'amount', type: 'uint160' },
            { internalType: 'uint48', name: 'expiration', type: 'uint48' },
            { internalType: 'uint48', name: 'nonce', type: 'uint48' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;
// 请替换为你的实际部署地址！
const DEMO_CONTRACT_ADDRESS: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const YOUR_ERC20_TOKEN_ADDRESS: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const LOCAL_PERMIT2_ADDRESS: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'; // 本地测试时使用的 Permit2 地址

// --- 工具函数 ---
function toDeadline(expiration: number): number {
    return Math.floor((Date.now() + expiration) / 1000);
}

const PERMIT_EXPIRATION = 1000 * 60 * 60 * 24 * 30; // 30 天
const PERMIT_SIG_EXPIRATION = 1000 * 60 * 30; // 30 分钟

// 这是你的 TokenBank 应用程序的核心逻辑组件
export function TokenBankPageContent() {
  const { address: userAddress, isConnected } = useAccount();
  const { open } = useAppKit(); // 获取 AppKit 的 open 方法
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);



  // 使用 useQuery 来集中管理所有余额和代币信息的获取
  const { data: balanceData, isLoading: isLoadingBalances, refetch: refetchBalances } = useQuery({
    queryKey: ['userBalances', userAddress, YOUR_ERC20_TOKEN_ADDRESS, DEMO_CONTRACT_ADDRESS],
    queryFn: async () => {
      if (!userAddress || !publicClient) return null;
      console.log('正在获取用户余额和代币信息...');
      const [symbolResult , decimalsResult, tokenBalanceResult, bankBalanceResult]  = await Promise.all([
          publicClient.readContract({
            address: YOUR_ERC20_TOKEN_ADDRESS,
            abi: MY_ERC20_ABI,
            functionName: 'symbol',
          }),
        
          publicClient.readContract({
              address: YOUR_ERC20_TOKEN_ADDRESS,
              abi: MY_ERC20_ABI,
              functionName: 'decimals',
            }),

          publicClient.readContract({
              address: YOUR_ERC20_TOKEN_ADDRESS,
              abi: MY_ERC20_ABI,
              functionName: 'balanceOf',
              args: [userAddress],
          }),

        publicClient.readContract({
            // 获取用户在 TokenBank 中的余额
            address: DEMO_CONTRACT_ADDRESS,
            abi: TOKEN_BANK_ABI,
            functionName: 'getBalance',
            args: [userAddress, YOUR_ERC20_TOKEN_ADDRESS],
        })
      ]);

     
      return {
        decimals: decimalsResult as number | undefined,
        symbol: symbolResult as string | undefined,
        userTokenBalance: tokenBalanceResult as bigint | undefined,
        userBankBalance: bankBalanceResult as bigint | undefined,
      };
    },
    enabled: !!userAddress && !!publicClient,
    staleTime: Infinity, // 数据永不过期，除非手动调用 refetch
    gcTime: Infinity,    // 缓存永不回收，除非手动清理
  });

   console.log('用户余额和代币信息:', {
        symbol: balanceData?.symbol,
        decimals: balanceData?.decimals,
        userTokenBalance:balanceData?.userTokenBalance,
        userBankBalance: balanceData?.userBankBalance,
      });
  const tokenDecimals = balanceData?.decimals;
  const tokenSymbol = balanceData?.symbol;
  const userTokenBalance = balanceData?.userTokenBalance;
  const userBankBalance = balanceData?.userBankBalance;


  const { writeContractAsync, isPending } = useWriteContract();
  // useSignTypedData 仍需要从 wagmi 导入，因为它是 wagmi 的核心签名功能
  const { signTypedDataAsync } = require('wagmi').useSignTypedData();


  const handleDeposit = async () => {
    if (!isConnected || !userAddress || tokenDecimals === undefined || !publicClient) {
      alert('请先连接钱包，确保代币信息已加载，并公共客户端已准备好。');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      alert('请输入有效的存款金额。');
      return;
    }

    setStatus('正在准备签名...');
    try {
      const amountWei = parseUnits(amount, tokenDecimals);

      if (userTokenBalance !== undefined && amountWei > userTokenBalance) {
          alert(`您的钱包余额不足。您有 ${formatUnits(userTokenBalance, tokenDecimals)} ${tokenSymbol || '代币'}，但需要 ${amount} ${tokenSymbol || '代币'}。`);
          setStatus('存款失败: 余额不足');
          return;
      }

       // **关键修改:** 直接通过 publicClient 调用合约，绕过 AllowanceProvider
      const allowanceResult = await publicClient.readContract({
          address: LOCAL_PERMIT2_ADDRESS,
          abi: PERMIT2_ABI,
          functionName: 'allowance',
          args: [userAddress, YOUR_ERC20_TOKEN_ADDRESS, DEMO_CONTRACT_ADDRESS],
      });

      // allowanceResult 是一个数组 [amount, expiration, nonce]
      const rawNonce = allowanceResult[2];

      // 2. 构建 PermitSingle 对象 (用于生成签名)
      const permitSingleForSigning: PermitSingle = {
          details: {
              token: YOUR_ERC20_TOKEN_ADDRESS,
              amount: MaxAllowanceTransferAmount,
              expiration: toDeadline(PERMIT_EXPIRATION),
              nonce: rawNonce,
          },
          spender: DEMO_CONTRACT_ADDRESS,
          sigDeadline: BigInt(toDeadline(PERMIT_SIG_EXPIRATION)),
      };

      // 3. 使用 AllowanceTransfer.getPermitData 生成 Typed Data
      const { domain, types, values } = AllowanceTransfer.getPermitData(permitSingleForSigning, LOCAL_PERMIT2_ADDRESS, chainId);

      /// 定义一个递归类型，允许字符串作为键
      // 这里我们使用 Record<string, any>，它表示一个对象，
      // 它的所有键都是字符串，所有值都是 any
      type RecursiveObject = Record<string, any>;

      const convertToBigInt = (obj: any): any => {
        // 如果不是对象，或者为空，直接返回
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        // 如果是 ethers.js 的 BigNumber，则转换为原生 bigint
        if (obj._isBigNumber) {
            return BigInt(obj.toString());
        }

        // 根据 obj 的类型（数组或普通对象）创建新对象，并显式声明其类型
        const newObj: RecursiveObject = Array.isArray(obj) ? [] : {};
        
        // 递归遍历所有键值对
        for (const key in obj) {
            // 使用 hasOwnProperty 确保只处理对象自身的属性
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = convertToBigInt(obj[key]);
            }
        }
        
        return newObj;
    };

      const viemCompatibleValues = convertToBigInt(values);
      // 4. 执行签名
      const signature = await signTypedDataAsync({
        domain: domain as any,
        types: types as any,
        primaryType: 'PermitSingle',
        message: viemCompatibleValues as any,
      });

      setStatus('签名成功，发送交易...');
      console.log('生成的 Permit2 签名:', signature);
      console.log('PermitSingle (用于签名) 数据:', permitSingleForSigning);
    
      // --- 为合约调用构建 PermitSingle 对象 ---
      const permitSingleForContract = {
          details: {
              token: permitSingleForSigning.details.token as Address,
              amount: BigInt(permitSingleForSigning.details.amount.toString()),
              expiration: BigInt(permitSingleForSigning.details.expiration.toString()),
              nonce: BigInt(permitSingleForSigning.details.nonce.toString()),
          },
          spender: permitSingleForSigning.spender as Address,
          sigDeadline: BigInt(permitSingleForSigning.sigDeadline.toString()),
      };

      // 5. 调用你的 TokenBank 合约的 depositWithPermit2 方法
      const hash = await writeContractAsync({
        address: DEMO_CONTRACT_ADDRESS,
        abi: TOKEN_BANK_ABI,
        functionName: 'depositWithPermit2',
        args: [
          YOUR_ERC20_TOKEN_ADDRESS,
          amountWei,
          signature,
          permitSingleForContract,
        ],
      });

      setStatus(`交易发送成功，哈希: ${hash}. 等待确认...`);
      console.log('交易哈希:', hash);
      setAmount('');
      setStatus('存款成功！');
      refetchBalances(); // 存款成功后，手动刷新所有余额信息

    } catch (error: any) {
      console.error('存款失败:', error);
      setStatus(`存款失败: ${error.shortMessage || error.message}`);
    }
  };

  // 格式化显示的余额
  const formattedBankBalance = userBankBalance && tokenDecimals !== undefined
    ? formatUnits(userBankBalance, tokenDecimals)
    : (isLoadingBalances ? '加载中...' : 'N/A');

  const formattedTokenBalance = userTokenBalance && tokenDecimals !== undefined
    ? formatUnits(userTokenBalance, tokenDecimals)
    : (isLoadingBalances ? '加载中...' : 'N/A');


  return (
    <div className="max-w-xl mx-auto mt-10 space-y-6 text-center">
      {!isConnected ? (
        <button
          onClick={() => open()} // 通过 AppKit 的 open 方法连接钱包
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          连接钱包
        </button>
      ) : (
        <>
          <p className="text-sm text-gray-600">连接的钱包地址: {userAddress}</p>
          <button
            onClick={() => disconnect()} // 断开连接
            className="bg-red-500 text-white px-4 py-2 rounded"
          >
            断开连接
          </button>
        </>
      )}

      {userAddress && (
        <>
          <hr />
          <p>
            您的 **{tokenSymbol || '代币'}** 钱包余额: **{formattedTokenBalance}** {tokenSymbol || '代币'}
          </p>
          <p>
            您在 **TokenBank** 中的 **{tokenSymbol || '代币'}** 余额: **{formattedBankBalance}** {tokenSymbol || '代币'}
          </p>
          <hr />

          <div>
            <label htmlFor="amount">存款金额 ({tokenSymbol || '...' }):</label>
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例如：100"
              step="any"
              className="border p-2 w-full"
            />
          </div>
          <button
            onClick={handleDeposit}
            disabled={isPending || !amount || !tokenDecimals || isLoadingBalances}
            className="bg-green-500 text-white px-4 py-2 rounded w-full"
          >
            {isPending ? '正在存款...' : 'Permit2 签名存款'}
          </button>
          {status && <p className="text-gray-500">状态: {status}</p>}
        </>
      )}
    </div>
  );
}

// 根组件，负责提供 AppKit 上下文
export default function App() {
    return (
        <AppKitProvider>
            <TokenBankPageContent />
        </AppKitProvider>
    );
}