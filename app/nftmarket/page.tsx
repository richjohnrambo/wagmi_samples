"use client";

import { useState, useEffect } from 'react';
import {
    useAccount,
    useDisconnect,
    useChainId,
    useChains,
    useReadContract,
    useWriteContract,
    useClient,
    useBalance
} from 'wagmi';
import { AppKitProvider } from './nftmarket-config';
import NFTMarket_ABI from '../contracts/NFTMarket.json';
import { useAppKit } from '@reown/appkit/react';

const NFT_MARKET_ADDRESS = "0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F"; // 替换为实际的 NFT Market 合约地址

export  function NFFMarketPage() {
  const { address, isConnected } = useAccount(); // 使用 wagmi 来获取钱包地址
  const { open } = useAppKit(); // 从 AppKit 获取 open 方法
  const { disconnect } = useDisconnect();
  const [tokenId, setTokenId] = useState(1);
  const [price, setPrice] = useState("1000000000000000000000"); // 1e21 token
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const { writeContractAsync, isPending } = useWriteContract();

  // 处理上架NFT
  const handleList = async () => {
    setError("");
    try {
      const hash = await writeContractAsync({
        address: NFT_MARKET_ADDRESS,
        abi: NFTMarket_ABI,
        functionName: "list",
        args: [tokenId, price],
      });
      setTxHash(hash);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 购买NFT
  const handleBuy = async () => {
    setError("");
    try {
      const hash = await writeContractAsync({
        address: NFT_MARKET_ADDRESS,
        abi: NFTMarket_ABI,
        functionName: "buyNFT",
        args: [tokenId],
      });
      setTxHash(hash);
    } catch (err: any) {
      setError(err.message);
    }
  };

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
          <p className="text-sm text-gray-600">连接的钱包地址: {address}</p>
          <button
            onClick={() => disconnect()} // 断开连接
            className="bg-red-500 text-white px-4 py-2 rounded"
          >
            断开连接
          </button>
        </>
      )}

      {/* 上架NFT */}
      <div className="space-y-2">
        <h2 className="font-bold text-lg">上架 NFT</h2>
        <input
          type="number"
          value={tokenId}
          onChange={(e) => setTokenId(Number(e.target.value))}
          placeholder="Token ID"
          className="border p-2 w-full"
        />
        <input
          type="text"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="价格（单位 token）"
          className="border p-2 w-full"
        />
        <button
          onClick={handleList}
          className="bg-green-500 text-white px-4 py-2 rounded w-full"
        >
          上架 NFT
        </button>
      </div>

      {/* 购买NFT */}
      <div className="space-y-2">
        <h2 className="font-bold text-lg">购买 NFT</h2>
        <input
          type="number"
          value={tokenId}
          onChange={(e) => setTokenId(Number(e.target.value))}
          placeholder="Token ID"
          className="border p-2 w-full"
        />
        <button
          onClick={handleBuy}
          className="bg-purple-500 text-white px-4 py-2 rounded w-full"
        >
          购买 NFT
        </button>
      </div>

      {/* 状态反馈 */}
      {isPending && <p className="text-gray-500">交易处理中...</p>}
      {txHash && (
        <p className="text-blue-500 break-words">交易成功: {txHash}</p>
      )}
      {error && <p className="text-red-500">错误: {error}</p>}
    </div>
  );
}



export default function App() {
    return (
        <AppKitProvider>
            <NFFMarketPage />
        </AppKitProvider>
    );
} 
