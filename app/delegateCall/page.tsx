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
import { type Address, parseUnits,encodeFunctionData, formatUnits } from 'viem';
import { useQuery } from '@tanstack/react-query'; // 从 React Query 导入 useQuery
import { useAppKit } from '@reown/appkit/react'; // 从 AppKit 导入 useAppKit

// 导入 AppKitProvider
import { AppKitProvider } from './delegate-config'; // 根据你的实际文件路径调整导入
import TOKEN_BANK_ABI from '../contracts/TokenBank_delegate.json' with { type: 'json' };
import MY_ERC20_ABI from '../contracts/MyERC20.json' with { type: 'json' };
import DELEGATE_EXECUTOR_ABI from '../contracts/DelegateCallExecutor.json' with { type: 'json' };
 

// 请替换为你的实际部署地址！
const DEMO_CONTRACT_ADDRESS: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const YOUR_ERC20_TOKEN_ADDRESS: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const DELEGATE_EXECUTOR_ADDRESS: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'; // 本地测试时使用的 Permit2 地址

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
  
    // 获取当前 EOA 的 nonce
  const { data: delegateNonce, refetch: refetchNonce } = useReadContract({
      address: DELEGATE_EXECUTOR_ADDRESS,
      abi: DELEGATE_EXECUTOR_ABI,
      functionName: 'nonces',
      args: [userAddress],
      query: {
        enabled: !!userAddress, // 👈 正确的位置
      },
  });


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

      // 1. 构建两个 Calldata
      const approveCalldata = encodeFunctionData({
          abi: MY_ERC20_ABI,
          functionName: 'approve',
          args: [DEMO_CONTRACT_ADDRESS, amountWei],
      });
      const depositCalldata = encodeFunctionData({
          abi: TOKEN_BANK_ABI,
          functionName: 'deposit',
          args: [YOUR_ERC20_TOKEN_ADDRESS, amountWei],
      });

            
      // 2. 构造 calls 数组
      const to = [YOUR_ERC20_TOKEN_ADDRESS, DEMO_CONTRACT_ADDRESS];
      const values = [BigInt(0), BigInt(0)]; // 不发送 ETH
      const data = [approveCalldata, depositCalldata];
      const currentNonce = delegateNonce;

      if (currentNonce === undefined) {
          setStatus('错误：无法获取 Delegate 合约的 nonce。');
          return;
      }

      // 3. 构建 EIP-712 签名数据
      const domain = {
          name: 'DelegateCallExecutor',
          version: '1',
          chainId: chainId,
          verifyingContract: DELEGATE_EXECUTOR_ADDRESS,
      };

      const types = {
          Execute: [
              { name: 'to', type: 'address[]' },
              { name: 'values', type: 'uint256[]' },
              { name: 'data', type: 'bytes[]' },
              { name: 'nonce', type: 'uint256' },
          ],
      };
      const message = {
          to: to,
          values: values,
          data: data,
          nonce: currentNonce,
      };

      setStatus('等待钱包签名...');

      // 4. 用户签名
      const signature = await signTypedDataAsync({
          domain: domain as any,
          types: types as any,
          primaryType: 'Execute',
          message: message as any,
      });

      setStatus('签名成功，发送交易到 Delegate 合约...');

      // 4. 调用 Delegate 合约的 executeBatch 函数
            // 5. 调用 Delegate 合约的 executeBatch 函数
      const hash = await writeContractAsync({
          address: DELEGATE_EXECUTOR_ADDRESS,
          abi: DELEGATE_EXECUTOR_ABI,
          functionName: 'executeBatch',
          args: [to, values, data, currentNonce, signature],
      });

      

      setStatus(`交易发送成功，哈希: ${hash}. 等待确认...`);
      console.log('交易哈希:', hash);
      // 存款成功后，手动刷新 nonce 和余额
      refetchNonce();
      refetchBalances();
      setAmount('');
      setStatus('存款成功！');
  
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