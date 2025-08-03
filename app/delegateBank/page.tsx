"use client";

// import React, { useState, useEffect } from 'react';
// import {
//     createPublicClient,
//     createWalletClient,
//     http,
//     parseUnits,
//     encodeFunctionData,
//     Hex,
//     type Address,
//     type WalletClient,
//     type PublicClient,
//     type Chain,
//     formatUnits
// } from 'viem';
// import { privateKeyToAccount } from 'viem/accounts';
// import { foundry } from 'viem/chains';
import React, { useState, useEffect } from 'react';
import { type Address, type Chain, 
    
    Hex,parseUnits,createPublicClient,formatUnits, createWalletClient, http, encodeFunctionData} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains'
import type { TransactionReceipt } from 'viem';
import TOKEN_BANK_ABI from '../contracts/TokenBank_delegate.json' with { type: 'json' };
import MY_ERC20_ABI from '../contracts/MyERC20.json' with { type: 'json' };
import DELEGATE_EXECUTOR_ABI from '../contracts/DelegateCallExecutor.json' with { type: 'json' };

// --- 请替换为你的合约地址和 ABI ---
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';


const YOUR_ERC20_TOKEN_ADDRESS: Address = '0xf4A9F39825865a4D41dFB77Ea63Ce961aFa7aeec';
const DELEGATE_EXECUTOR_ADDRESS: Address = '0x401b085F6ED52d665D9E1a7743a38923990EA902';
const TOKEN_BANK_ADDRESS: Address = '0xa4818230a693b19B0Bc63Ae8786B732A798C3b24';


export function TokenBankPageContent() {
    const [userAddress, setUserAddress] = useState<Address | null>(null);
    const [chain, setChain] = useState<Chain | null>(null);
    const [amount, setAmount] = useState<string>('0');
    const [status, setStatus] = useState<string>('');
    const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
    const [isConnecting, setIsConnecting] = useState<boolean>(false);
    
    // 新增状态：存储代币的动态信息
    const [tokenBalance, setTokenBalance] = useState<string | null>(null);
    const [bankBalance, setBankBalance] = useState<string | null>(null);
    const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
    const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
    const [rawTokenBalance, setRawTokenBalance] = useState<bigint | null>(null);

    const eoa = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
    
    const publicClient = createPublicClient({
                    chain: sepolia,
                    transport: http(process.env.RPC_URL!),
                });

    const walletClient = createWalletClient({
        account: eoa,
        chain: sepolia,
        transport: http(process.env.RPC_URL!),
    } )  
    // Effect hook to initialize viem clients and connect to a wallet
    useEffect(() => {
        const connectWallet = async () => {
            if (typeof window.ethereum === 'undefined') {
                setStatus('请安装 MetaMask 或其他支持的钱包。');
                return;
            }

            try {
                setIsConnecting(true);

                const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' }) as Address[];

                setUserAddress(address);
                setChain(sepolia);
                setStatus('钱包已连接。');

                setIsConnecting(false);
            } catch (error) {
                console.error('连接钱包失败:', error);
                setStatus('连接钱包失败。');
                setIsConnecting(false);
            }
        };

        connectWallet();
    }, []);
    
    // 新增：Effect hook to fetch all token-related information
    useEffect(() => {
      const fetchAllTokenData = async () => {
          if (publicClient && userAddress) {
              try {
                  const [tokenBal, bankBal, symbol, decimals] = await Promise.all([
                      publicClient.readContract({
                          address: YOUR_ERC20_TOKEN_ADDRESS,
                          abi: MY_ERC20_ABI,
                          functionName: 'balanceOf',
                          args: [userAddress],
                      }) as Promise<bigint>,
                      publicClient.readContract({
                          address: TOKEN_BANK_ADDRESS,
                          abi: TOKEN_BANK_ABI,
                          functionName: 'getBalance',
                          args: [userAddress, YOUR_ERC20_TOKEN_ADDRESS],
                      }) as Promise<bigint>,
                      publicClient.readContract({
                          address: YOUR_ERC20_TOKEN_ADDRESS,
                          abi: MY_ERC20_ABI,
                          functionName: 'symbol',
                      }) as Promise<string>,
                      publicClient.readContract({
                          address: YOUR_ERC20_TOKEN_ADDRESS,
                          abi: MY_ERC20_ABI,
                          functionName: 'decimals',
                      }) as Promise<number>
                  ]);

                  setTokenSymbol(symbol);
                  setTokenDecimals(decimals);
                  setTokenBalance(formatUnits(tokenBal, decimals));
                  setBankBalance(formatUnits(bankBal, decimals));
                   // 存储原始 BigInt 值用于逻辑判断
                  setRawTokenBalance(tokenBal);
              } catch (error) {
                  console.error('获取代币信息失败:', error);
                  setTokenBalance(null);
                  setBankBalance(null);
                  setTokenSymbol(null);
                  setTokenDecimals(null);
                  setRawTokenBalance(null);
              }
          }
      };
      fetchAllTokenData();
    }, [publicClient, userAddress, txHash]); // txHash 作为依赖，以便在交易成功后刷新余额

    // Effect hook to wait for transaction receipt
    useEffect(() => {
        const waitForTx = async () => {
            if (publicClient && txHash) {
                setStatus(`交易发送成功，哈希: ${txHash}. 等待确认...`);
                try {
                    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
                    setStatus(`交易确认成功！`);
                    console.log('Transaction confirmed:', receipt);
                } catch (error) {
                    setStatus(`交易失败: ${error}`);
                    console.error('Transaction failed:', error);
                }
            }
        };
        waitForTx();
    }, [publicClient, txHash]);


    const handleDeposit = async () => {
            if (!userAddress || !walletClient || !publicClient || !chain || rawTokenBalance === null || tokenDecimals === null || tokenSymbol === null) {
                setStatus('请先连接钱包并等待链信息和代币信息加载。');
                return;
            }

        setStatus('正在准备交易数据...');
        try {
            const amountWei = parseUnits(amount, tokenDecimals);
            
            // 直接将用户输入的金额（Wei）与钱包余额的原始 Wei 值进行比较
            if (amountWei > rawTokenBalance) {
                alert(`您的钱包余额不足。您有 ${tokenBalance} ${tokenSymbol}，但需要 ${amount} ${tokenSymbol}。`);
                setStatus('存款失败: 余额不足');
                return;
            }

            // 1. 构造 calldata
            const approveCalldata = encodeFunctionData({
                abi: MY_ERC20_ABI,
                functionName: 'approve',
                args: [TOKEN_BANK_ADDRESS, amountWei],
            });
            const depositCalldata = encodeFunctionData({
                abi: TOKEN_BANK_ABI,
                functionName: 'deposit',
                args: [YOUR_ERC20_TOKEN_ADDRESS, amountWei],
            });
            
            // 2. 构造批量 calls 数组
            const calls = [
                {
                    to: YOUR_ERC20_TOKEN_ADDRESS,
                    data: approveCalldata,
                    value: BigInt(0),
                },
                {
                    to: TOKEN_BANK_ADDRESS,
                    data: depositCalldata,
                    value: BigInt(0),
                },
            ];

            const executeCalldata = encodeFunctionData({
                abi: DELEGATE_EXECUTOR_ABI,
                functionName: 'execute',
                args: [calls],
            });

            // 3. 生成 EIP-7702 授权签名
            // viem 的 signAuthorization 方法是为 EIP-7702 设计的，但它在某些客户端中可能需要特殊配置
            // 在此示例中，我们假设它可以直接使用
            setStatus('等待钱包签名授权...');
            
            // const authorization = await walletClient.signAuthorization({
            //      address: userAddress,
            //      executor: DELEGATE_EXECUTOR_ADDRESS,
            // });

            // const authorization = await walletClient.signAuthorization({
            //     contractAddress: DELEGATE_EXECUTOR_ADDRESS,
            //     executor: eoa.address,
            //     calls: calls,
            // });
            
            // 自己执行授权时，nonce +1 
            const authorization = await walletClient.signAuthorization({
                    contractAddress: DELEGATE_EXECUTOR_ADDRESS,
                    executor: 'self', 
                });


            // 发送 EIP-7702 交易

            const hash = await walletClient.writeContract({
                abi: DELEGATE_EXECUTOR_ABI,
                address: eoa.address,
                functionName: 'execute',
                args: [calls],
                authorizationList: [authorization],
            });

            setStatus('签名授权成功，发送交易...');

            // // 4. 发送 EIP-7702 交易
            // const hash = await walletClient.writeContract({
            //     address: DELEGATE_EXECUTOR_ADDRESS,
            //     abi: DELEGATE_EXECUTOR_ABI,
            //     functionName: 'execute',
            //     args: [calls as any],
            //     chain: chain,
            //     // account: eoa.address,
            //     // account: userAddress,
            //     authorizationList: [authorization] as any
            // });

            // const hash = await walletClient.writeContract({
            //     abi: DELEGATE_EXECUTOR_ABI,
            //     address: DELEGATE_EXECUTOR_ADDRESS, // 交易目标是执行器合约
            //     functionName: 'execute',
            //     args: [calls],
            //     authorizationList: [authorization],
            // });

            //  const hash = await walletClient.writeContract({
            //     abi: DELEGATE_EXECUTOR_ABI,
            //     address: DELEGATE_EXECUTOR_ADDRESS,
            //     functionName: 'execute',
            //     args: [calls],
            //     authorizationList: [authorization],
            // });
            console.log('EIP-7702 批量交易已发送，tx hash:', hash);

            const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: hash })
            console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败')

            setTxHash(hash);
            setStatus(`交易发送成功，哈希: ${hash}. 等待确认...`);
            
        } catch (error: any) {
            console.error('存款失败:', error);
            setStatus(`存款失败: ${error.message}`);
        }
    };
    
    const isConnected = !!userAddress;
    const isTokenDataLoaded = tokenSymbol !== null && tokenDecimals !== null;

    return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-900 min-h-screen text-slate-50 font-sans">
            <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h1 className="text-4xl font-bold text-center text-indigo-400 mb-6">代币银行</h1>
                <p className="text-center text-slate-300 mb-8">
                    使用单个签名完成授权和存款操作。
                </p>

                <div className="flex flex-col space-y-4">
                    {!isConnected ? (
                        <button 
                            onClick={() => window.location.reload()}
                            disabled={isConnecting}
                            className="w-full p-3 rounded-lg bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-colors duration-200 disabled:bg-slate-500 disabled:cursor-not-allowed"
                        >
                            {isConnecting ? '正在连接...' : '连接钱包'}
                        </button>
                    ) : (
                        <>
                            <p className="text-center text-sm font-mono text-slate-400 break-words">
                                已连接: {userAddress}
                            </p>
                            <div className="mt-4 space-y-2">
                                {isTokenDataLoaded ? (
                                    <>
                                        <p className="text-left font-bold text-indigo-300">
                                            您的钱包余额: {tokenBalance || '0'} {tokenSymbol}
                                        </p>
                                        <p className="text-left font-bold text-indigo-300">
                                            银行存款余额: {bankBalance || '0'} {tokenSymbol}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-left font-bold text-slate-400">
                                        代币信息加载中...
                                    </p>
                                )}
                            </div>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder={`存款金额 (${tokenSymbol || '...'})`}
                                className="w-full p-3 rounded-lg bg-slate-700 text-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button 
                                onClick={handleDeposit}
                                disabled={!isConnected || !isTokenDataLoaded}
                                className="w-full p-3 rounded-lg bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-colors duration-200 disabled:bg-slate-500 disabled:cursor-not-allowed"
                            >
                                存款
                            </button>
                        </>
                    )}
                </div>

                {status && (
                    <div className="mt-6 p-4 rounded-lg bg-slate-700 text-slate-300 text-sm break-words">
                        <p className="font-mono">{status}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
export default function TokenBankPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <TokenBankPageContent />
    </div>
  );
}