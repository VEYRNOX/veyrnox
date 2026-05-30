import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Google Drive connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    let yPosition = margin;

    // Title Page
    doc.setFillColor(255, 107, 53);
    doc.rect(0, 0, pageWidth, 60, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('SafeDigital Wallet', pageWidth / 2, 25, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text('Complete Documentation', pageWidth / 2, 35, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Generated on ${new Date().toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    })}`, pageWidth / 2, 45, { align: 'center' });
    
    doc.setTextColor(100, 100, 100);
    doc.text(`Prepared for: ${user.full_name || user.email}`, pageWidth / 2, 52, { align: 'center' });

    // Table of Contents
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Table of Contents', margin, yPosition);
    yPosition += 10;
    
    doc.setDrawColor(255, 107, 53);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, margin + contentWidth, yPosition);
    yPosition += 8;

    const sections = [
      { title: 'Feature Catalog', page: 3 },
      { title: 'Core Wallet Features', page: 3 },
      { title: 'Security Features', page: 4 },
      { title: 'Portfolio Management', page: 5 },
      { title: 'Trading & Swaps', page: 6 },
      { title: 'DeFi & Yield', page: 7 },
      { title: 'Payments & Banking', page: 8 },
      { title: 'Analytics & Insights', page: 9 },
      { title: 'Alerts & Automation', page: 10 },
      { title: 'NFT Features', page: 11 },
      { title: 'Identity & Social', page: 12 },
      { title: 'Advanced Features', page: 13 },
      { title: 'Mobile & Accessibility', page: 14 },
      { title: 'Key User Workflows', page: 15 },
      { title: 'Security Architecture', page: 21 },
    ];

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    sections.forEach((section) => {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(section.title, margin, yPosition);
      doc.text(`Page ${section.page}`, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 6;
    });

    // Feature Catalog
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Feature Catalog', margin, yPosition);
    yPosition += 10;
    
    doc.line(margin, yPosition, margin + contentWidth, yPosition);
    yPosition += 8;

    const features = [
      {
        category: 'Core Wallet',
        items: [
          'Multi-Chain Support - Bitcoin, Ethereum, Solana, Polygon, BSC, Cosmos, Tron, Sui',
          'Send/Receive - Secure crypto transfers with QR scanning and ENS/SNS resolution',
          'Cross-Chain Swap - Aggregate DEX swaps across multiple chains',
          'Address Book - Save and manage trusted wallet addresses',
          'Transaction History - Complete transaction log with filtering and export',
        ]
      },
      {
        category: 'Security',
        items: [
          'Passkey Authentication - Biometric login using WebAuthn/FIDO2',
          'Email OTP 2FA - Two-factor authentication for high-risk actions',
          'Address Whitelist - Restrict withdrawals to pre-approved addresses',
          'Transaction Limits - Daily/per-transaction USD limits with alerts',
          'Hardware Wallet - Ledger, Trezor, Coldcard integration',
          'Multi-Sig Wallets - M-of-N signature wallets for enhanced security',
          'RASP Security - Runtime Application Self-Protection',
          'Geo-Blocking - Restrict access by country/region',
        ]
      },
      {
        category: 'Portfolio Management',
        items: [
          'Dashboard Overview - Real-time portfolio value, allocation charts, P&L tracking',
          'Net Worth Tracker - Track crypto + traditional assets (property, stocks, cash)',
          'Custom Index Builder - Create and manage custom crypto indices',
          'Portfolio Snapshots - Time-travel portfolio value at historical dates',
          'What-If Simulator - Model hypothetical trades and their impact',
          'Shared Portfolio View - Generate shareable portfolio links with privacy controls',
          'Benchmarking - Compare performance against market indices',
        ]
      },
      {
        category: 'Trading & Swaps',
        items: [
          'DEX Aggregator - Best-price swaps across Uniswap, PancakeSwap, etc.',
          'Perpetuals Trading - Leveraged trading with up to 50x',
          'Limit Orders - Price-triggered buy/sell orders',
          'Conditional Swaps - Auto-swap when price targets are hit',
          'Social Trading - Follow and copy top traders\' signals',
          'Trade Signals - AI-generated trading recommendations',
        ]
      },
      {
        category: 'DeFi & Yield',
        items: [
          'Staking - Earn yield on ETH, SOL, and other PoS assets',
          'Yield Farming - Liquidity provision across DeFi protocols',
          'Lending/Borrowing - Collateralized loans via Aave, Compound',
          'Crypto Loans - Track and manage collateralized debt positions',
          'Rebalancing - Auto-rebalance portfolio to target allocations',
          'DCA Schedules - Dollar-cost averaging automation',
        ]
      },
      {
        category: 'Payments & Banking',
        items: [
          'Fiat Ramp - Buy/sell crypto via bank transfer (SEPA, SWIFT, FPS)',
          'Recurring Payments - Schedule automatic crypto payments',
          'Crypto Payroll - Pay employees/contractors in crypto',
          'Split Bills - Split expenses and collect from multiple people',
          'Invoice Generator - Create crypto payment invoices with QR codes',
          'Payment Links - Generate merchant payment QR codes',
          'Bank Link - Connect European bank accounts via Open Banking',
          'Subscriptions - Track and manage recurring crypto subscriptions',
        ]
      },
      {
        category: 'Analytics & Insights',
        items: [
          'Advanced Analytics - Portfolio performance, win rate, Sharpe ratio',
          'On-Chain Analytics - Track whale movements, smart money flows',
          'Spending Patterns - Categorize and analyze crypto spending',
          'Fee Analytics - Track gas fees and optimize transaction costs',
          'Tax Report - Generate capital gains/losses reports',
          'Tax Harvesting - Identify loss harvesting opportunities',
          'P&L Tracking - Real-time profit/loss by asset and wallet',
        ]
      },
      {
        category: 'Alerts & Automation',
        items: [
          'Price Alerts - Push/email alerts for price thresholds',
          'Smart Alerts - AI-powered anomaly detection alerts',
          'Messenger Alerts - Telegram/WhatsApp notifications',
          'Webhook Builder - Custom webhooks for external integrations',
          'Portfolio Automation - Rule-based auto-trading and rebalancing',
          'Trading Bots - Deploy automated trading strategies',
        ]
      },
      {
        category: 'NFTs',
        items: [
          'NFT Portfolio - View NFTs across multiple chains',
          'NFT Gallery - Showcase NFTs with custom displays',
          'NFT Minting - Mint NFTs directly from the wallet',
          'Multi-Chain NFT - Support for Ethereum, Solana, Polygon NFTs',
        ]
      },
      {
        category: 'Identity & Social',
        items: [
          'DID Management - Decentralized identity credentials',
          'ENS Registration - Register and manage .eth domains',
          'Public Profiles - Shareable trader profiles with stats',
          'Leaderboard - Rank traders by performance',
          'Encrypted Messaging - End-to-end encrypted chat between users',
          'Referral Tracker - Track and reward referrals',
        ]
      },
      {
        category: 'Advanced Features',
        items: [
          'DAO Governance - Vote on proposals across protocols',
          'Carbon Tracker - Track and offset crypto carbon footprint',
          'Crypto Will - Estate planning and inheritance setup',
          'Fraud Detection - AI-powered scam detection',
          'Cross-Chain Bridge - Bridge assets between chains',
          'Token Approvals - Monitor and revoke token allowances',
          'Spam Token Filter - Auto-hide scam tokens',
        ]
      },
      {
        category: 'Mobile & Accessibility',
        items: [
          'PWA Install - Install as native app on iOS/Android',
          'Mobile Widget - Home screen portfolio widgets',
          'Voice Commands - Voice-controlled wallet actions',
          'Biometric Auth - Face ID / Touch ID login',
          'DApp Connector - WalletConnect v2 for dApp access',
          'Web3 Browser - Built-in dApp browser',
        ]
      },
    ];

    features.forEach((category) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 107, 53);
      doc.text(category.category, margin, yPosition);
      yPosition += 6;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      category.items.forEach((item) => {
        if (yPosition > pageHeight - 15) {
          doc.addPage();
          yPosition = margin;
        }
        const lines = doc.splitTextToSize('• ' + item, contentWidth);
        doc.text(lines, margin, yPosition);
        yPosition += (lines.length * 4) + 2;
      });

      yPosition += 3;
    });

    // Workflows Section
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Key User Workflows', margin, yPosition);
    yPosition += 10;
    
    doc.line(margin, yPosition, margin + contentWidth, yPosition);
    yPosition += 8;

    const workflows = [
      {
        title: 'Onboarding Flow',
        steps: [
          '1. Account Creation - User registers with email + password, verifies via OTP',
          '2. Passkey Setup - Enroll biometric authentication (Face ID, Touch ID, Windows Hello)',
          '3. Wallet Creation - Create first wallet (BTC, ETH, SOL) with auto-generated seed phrase',
          '4. Backup Seed QR - Download encrypted QR backup of seed phrase',
          '5. KYC Verification - Optional identity verification for fiat ramps',
        ]
      },
      {
        title: 'Send Crypto Flow',
        steps: [
          '1. Select Wallet - Choose source wallet and asset',
          '2. Enter Recipient - Paste address, scan QR, or use ENS/SNS name',
          '3. Whitelist Check - System validates if address is whitelisted; warns if not',
          '4. Enter Amount - Input amount with USD equivalent display',
          '5. 2FA Verification - Authenticate via Passkey OR Email OTP',
          '6. Transaction Broadcast - Signed transaction sent to blockchain',
          '7. Audit Log - Transaction recorded in immutable audit trail',
        ]
      },
      {
        title: 'Portfolio Rebalancing Flow',
        steps: [
          '1. Set Target Allocation - Define desired portfolio percentages',
          '2. Enable Monitoring - System tracks drift in real-time',
          '3. Drift Alert - Notification when allocation deviates > threshold',
          '4. Review Trades - System calculates optimal rebalancing trades',
          '5. Execute Trades - User approves; DEX aggregator finds best routes',
          '6. Confirmation - Portfolio returns to target allocation',
        ]
      },
      {
        title: 'Fiat On-Ramp Flow',
        steps: [
          '1. Select Currency - Choose fiat (GBP, EUR, USD) and crypto asset',
          '2. Enter Amount - Input fiat amount to spend',
          '3. Bank Link - Connect bank via Open Banking (PSD2)',
          '4. KYC Check - Verify identity if first-time or large amount',
          '5. SEPA/SWIFT Transfer - Initiate bank transfer to partner exchange',
          '6. Crypto Credit - Crypto deposited to wallet upon settlement (1-3 days)',
        ]
      },
      {
        title: 'Staking Flow',
        steps: [
          '1. Select Asset - Choose stakeable asset (ETH, SOL, etc.)',
          '2. Choose Validator - Select validator by APR, commission, reliability',
          '3. Enter Amount - Input amount to stake',
          '4. Confirm Delegation - Sign delegation transaction',
          '5. Track Rewards - View accrued staking rewards in real-time',
          '6. Unstake/Claim - Initiate unbonding and claim rewards',
        ]
      },
      {
        title: 'Price Alert Flow',
        steps: [
          '1. Select Asset - Choose cryptocurrency to monitor',
          '2. Set Condition - Define trigger (price above/below target)',
          '3. Choose Notification - Select push, email, or Telegram/WhatsApp',
          '4. Monitoring Active - Backend checks prices every 60 seconds',
          '5. Alert Triggered - Notification sent when condition met',
          '6. Quick Action - Alert includes link to swap/buy/sell',
        ]
      },
    ];

    workflows.forEach((workflow) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(workflow.title, margin, yPosition);
      yPosition += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      workflow.steps.forEach((step) => {
        if (yPosition > pageHeight - 10) {
          doc.addPage();
          yPosition = margin;
        }
        const lines = doc.splitTextToSize(step, contentWidth);
        doc.text(lines, margin, yPosition);
        yPosition += (lines.length * 4) + 1;
      });

      yPosition += 5;
    });

    // Security Architecture
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Security Architecture', margin, yPosition);
    yPosition += 10;
    
    doc.line(margin, yPosition, margin + contentWidth, yPosition);
    yPosition += 8;

    const securitySections = [
      {
        title: 'Authentication',
        items: [
          '• WebAuthn/FIDO2 Passkeys',
          '• Email OTP 2FA',
          '• Biometric verification',
          '• Session management',
        ]
      },
      {
        title: 'Transaction Security',
        items: [
          '• Address whitelisting',
          '• Transaction limits',
          '• Multi-sig support',
          '• Hardware wallet integration',
        ]
      },
      {
        title: 'Infrastructure',
        items: [
          '• RASP protection',
          '• Geo-blocking',
          '• Audit logging',
          '• Encrypted backups',
        ]
      },
    ];

    securitySections.forEach((section) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, margin, yPosition);
      yPosition += 6;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      section.items.forEach((item) => {
        if (yPosition > pageHeight - 10) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(item, margin, yPosition);
        yPosition += 5;
      });

      yPosition += 3;
    });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      doc.text('SafeDigital Wallet Documentation', margin, pageHeight - 10);
    }

    const pdfBytes = doc.output('arraybuffer');
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const fileName = `SafeDigitalWallet_Documentation_${new Date().toISOString().split('T')[0]}.pdf`;

    // Upload to Google Drive
    const form = new FormData();
    const metadata = {
      name: fileName,
      parents: ['root'] // Will be replaced with team folder ID if specified
    };
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', pdfBlob);

    const driveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    const driveResult = await driveResponse.json();

    if (!driveResponse.ok) {
      throw new Error(`Google Drive upload failed: ${JSON.stringify(driveResult)}`);
    }

    return Response.json({
      success: true,
      file_id: driveResult.id,
      file_name: fileName,
      web_view_link: driveResult.webViewLink,
      message: 'PDF generated and uploaded to Google Drive successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});