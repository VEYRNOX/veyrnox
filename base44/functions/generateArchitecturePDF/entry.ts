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
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

    // Title Page
    doc.setFillColor(255, 107, 53);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('SafeDigital Wallet', pageWidth / 2, pageHeight / 2 - 10, { align: 'center' });
    
    doc.setFontSize(24);
    doc.setFont('helvetica', 'normal');
    doc.text('Solution Architecture', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Prepared for: ${user.full_name || user.email}`, pageWidth / 2, pageHeight / 2 + 30, { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, pageHeight / 2 + 40, { align: 'center' });
    doc.text('Version 1.0', pageWidth / 2, pageHeight / 2 + 50, { align: 'center' });

    // Page 2: Executive Summary
    doc.addPage();
    let y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Executive Summary', margin, y);
    y += 12;
    
    doc.setDrawColor(255, 107, 53);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const summary = [
      'SafeDigital Wallet is a comprehensive, multi-chain cryptocurrency wallet platform designed for retail and institutional users.',
      'The architecture follows a modern, cloud-native approach with separation of concerns, microservices principles, and security-first design.',
      '',
      'Key Architectural Principles:',
      '• Security-First: Multi-layer security with passkeys, 2FA, hardware wallet support, and RASP protection',
      '• Multi-Chain: Unified interface for Bitcoin, Ethereum, Solana, Polygon, BSC, Cosmos, Tron, and Sui',
      '• Scalability: Event-driven architecture with horizontal scaling capabilities',
      '• Compliance: Built-in KYC/AML, geo-blocking, audit logging, and regulatory reporting',
      '• User Experience: Progressive Web App (PWA) with native-like mobile experience',
      '',
      'Technology Stack:',
      '• Frontend: React 18 + Vite + Tailwind CSS (PWA with offline support)',
      '• Backend: Base44 Platform (Deno serverless functions)',
      '• Database: Base44 Entities (NoSQL with Row-Level Security)',
      '• State Management: React Query + localStorage',
      '• Blockchain: ethers.js v6, Web3.js, Solana Web3.js',
      '• UI Components: Radix UI primitives + shadcn/ui',
      '• Animations: Framer Motion',
      '• Charts: Recharts',
    ];

    summary.forEach((line) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += line === '' ? 8 : 5;
    });

    // Page 3: High-Level Architecture Diagram
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('High-Level Architecture', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Draw architecture boxes with improved styling
    const drawBox = (x, y, w, h, title, color = [240, 240, 240], subtitle = '') => {
      doc.setFillColor(...color);
      doc.roundedRect(x, y, w, h, 2, 2, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, w, h, 2, 2, 'S');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(title, x + w/2, y + h/2 - (subtitle ? 3 : 0), { align: 'center' });
      if (subtitle) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(subtitle, x + w/2, y + h/2 + 5, { align: 'center' });
      }
    };

    // User Layer
    drawBox(50, y, 80, 15, 'User Layer (PWA)', [255, 200, 180], 'Desktop + Mobile + Tablet');
    y += 22;

    // Presentation Layer
    drawBox(20, y, 50, 12, 'React Components', [200, 220, 255], '40+ Pages, 60+ Components');
    drawBox(80, y, 50, 12, 'State Management', [200, 220, 255], 'React Query + localStorage');
    drawBox(140, y, 50, 12, 'UI Library', [200, 220, 255], 'Radix UI + Tailwind');
    y += 18;

    // Application Layer
    drawBox(15, y, 45, 12, 'Backend Functions', [180, 255, 180], '8 Serverless Functions');
    drawBox(65, y, 45, 12, 'Entity Services', [180, 255, 180], '40+ Entity Types');
    drawBox(115, y, 45, 12, 'Integrations', [180, 255, 180], 'OAuth + REST APIs');
    drawBox(165, y, 45, 12, 'AI Agent', [180, 255, 180], 'LLM + Tools');
    y += 18;

    // Data Layer
    drawBox(20, y, 50, 12, 'Base44 Database', [255, 255, 180], 'NoSQL + RLS');
    drawBox(80, y, 50, 12, 'File Storage', [255, 255, 180], 'PDFs + Images');
    drawBox(140, y, 50, 12, 'Google Drive', [255, 255, 180], 'OAuth Integration');
    y += 18;

    // External Layer
    drawBox(15, y, 45, 12, 'Blockchain RPC', [255, 200, 255], '8 Networks');
    drawBox(65, y, 45, 12, 'DEX Aggregators', [255, 200, 255], '1inch, Jupiter');
    drawBox(115, y, 45, 12, 'Fiat Rails', [255, 200, 255], 'Stripe, Plaid');
    drawBox(165, y, 45, 12, 'Price Feeds', [255, 200, 255], 'CoinGecko');

    // Connection arrows
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.5);
    const centerX = pageWidth / 2;
    doc.line(centerX, y - 85, centerX, y - 80);
    doc.line(centerX, y - 75, centerX, y - 70);
    doc.line(centerX, y - 65, centerX, y - 60);
    doc.line(centerX, y - 55, centerX, y - 50);
    doc.line(centerX, y - 45, centerX, y - 40);

    y += 22;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Figure 1: Multi-Layer System Architecture', margin, y);

    // Page 4: Component Architecture
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Component Architecture', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    const components = [
      {
        title: 'Frontend Components',
        items: [
          'Pages (40+): Dashboard, Send, Receive, Swap, Staking, etc.',
          'Components (60+): Reusable UI components (cards, forms, charts)',
          'Layout: Responsive sidebar navigation with mobile tabs',
          'State: React Query for server state, localStorage for preferences',
          'Auth: Protected routes with token-based authentication',
        ]
      },
      {
        title: 'Backend Functions',
        items: [
          'checkPriceAlerts: Monitors price thresholds every 60s',
          'executeDCA: Processes dollar-cost averaging schedules',
          'fetchExchangeBalances: Syncs external exchange balances',
          'rebalancingMonitor: Tracks portfolio drift and triggers rebalancing',
          'rpcProxy: Secure blockchain RPC proxy with rate limiting',
          'rateLimiter: API rate limiting and throttling',
          'generateDocumentationPDF: Generates PDF documentation',
          'generateArchitecturePDF: Generates architecture diagrams',
        ]
      },
      {
        title: 'Entity Types (40+)',
        items: [
          'Core: Wallet, Transaction, AddressBook, NetworkConfig',
          'Security: WhitelistedAddress, TransactionLimit, AuditLog, UserSession',
          'Portfolio: PortfolioSnapshot, SavingsGoal, NetWorthAsset',
          'DeFi: StakingPosition, LendingPosition, YieldFarmPosition',
          'Trading: PriceAlert, TradeSignal, ConditionalSwap, DCASchedule',
          'NFT: NFTAsset, NFTGallery',
          'Social: PublicProfile, ReferralRecord, EncryptedMessage',
        ]
      },
    ];

    components.forEach((section) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = margin;
      }

      doc.setFillColor(255, 245, 240);
      doc.roundedRect(margin, y, pageWidth - (margin * 2), 25, 2, 2, 'F');
      
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 107, 53);
      doc.text(section.title, margin + 5, y + 8);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      let itemY = y + 15;
      section.items.forEach((item) => {
        if (itemY > pageHeight - 20) {
          doc.addPage();
          itemY = margin + 25;
        }
        doc.text('• ' + item, margin + 5, itemY);
        itemY += 5;
      });

      y += (section.items.length * 5) + 35;
    });

    // Page 5: Data Flow Diagram
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Data Flow Diagram', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Complete 7-Step Transaction Process Flow:', margin, y);
    y += 10;

    // Send Transaction Flow - Enhanced with better visualization
    const flowSteps = [
      { step: 1, title: 'User Input', desc: 'Enter recipient, amount, memo', icon: '📝' },
      { step: 2, title: 'Validation', desc: 'Address format, balance, whitelist', icon: '✓' },
      { step: 3, title: '2FA Challenge', desc: 'Passkey biometric or Email OTP', icon: '🔐' },
      { step: 4, title: 'TX Creation', desc: 'Create Transaction entity (pending)', icon: '📄' },
      { step: 5, title: 'Broadcast', desc: 'Sign + broadcast to blockchain RPC', icon: '📡' },
      { step: 6, title: 'Confirmation', desc: 'Wait for network confirmations', icon: '⏳' },
      { step: 7, title: 'Complete', desc: 'Update balance, log audit, notify', icon: '✅' },
    ];

    // Draw flow in two rows
    flowSteps.forEach((step, idx) => {
      const x = margin + (idx % 4) * 68;
      const yPos = y + Math.floor(idx / 4) * 55;

      // Step number circle
      doc.setFillColor(255, 107, 53);
      doc.circle(x + 34, yPos + 8, 6, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(String(step.step), x + 34, yPos + 10, { align: 'center' });

      // Box
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, yPos + 16, 68, 30, 2, 2, 'F');
      doc.roundedRect(x, yPos + 16, 68, 30, 2, 2, 'S');
      
      // Title
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(step.title, x + 34, yPos + 24, { align: 'center' });
      
      // Description
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(step.desc, 60);
      doc.text(lines, x + 34, yPos + 32, { align: 'center' });

      // Arrow to next step
      if (idx < flowSteps.length - 1 && (idx + 1) % 4 !== 0) {
        doc.setDrawColor(255, 107, 53);
        doc.setLineWidth(0.8);
        doc.line(x + 70, yPos + 31, x + 76, yPos + 31);
        // Arrowhead
        doc.setFillColor(255, 107, 53);
        doc.triangle(x + 76, yPos + 29, x + 80, yPos + 31, x + 76, yPos + 33, 'F');
      }
      if (idx < flowSteps.length - 1 && (idx + 1) % 4 === 0) {
        doc.setDrawColor(255, 107, 53);
        doc.line(x + 34, yPos + 48, x + 34, yPos + 54);
        doc.triangle(x + 32, yPos + 54, x + 34, yPos + 58, x + 36, yPos + 54, 'F');
      }
    });

    y += 120;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Figure 2: End-to-End Transaction Flow', margin, y);

    // Page 6: Security Architecture - Multi-Layer Security Model
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Security Architecture', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Five-Layer Defense-in-Depth Security Model:', margin, y);
    y += 10;

    const securityLayers = [
      {
        layer: 'Layer 1',
        title: 'Authentication',
        color: [255, 100, 80],
        items: [
          'WebAuthn/FIDO2 Passkeys (biometric)',
          'Email OTP (6-digit time-based codes)',
          'Device fingerprinting & tracking',
          'Session management with JWT',
          'Auto-logout on inactivity',
        ]
      },
      {
        layer: 'Layer 2',
        title: 'Authorization',
        color: [255, 120, 80],
        items: [
          'Row-Level Security (RLS) policies',
          'Role-based access (admin/user)',
          'Entity-level CRUD permissions',
          'OAuth token scoping',
          'Token expiration & refresh',
        ]
      },
      {
        layer: 'Layer 3',
        title: 'Transaction Security',
        color: [255, 140, 80],
        items: [
          'Address whitelisting with delays',
          'Daily/per-transaction limits',
          'Multi-signature wallet support',
          'Hardware wallet integration',
          '2FA confirmation for sends',
        ]
      },
      {
        layer: 'Layer 4',
        title: 'Infrastructure',
        color: [255, 160, 80],
        items: [
          'RASP (Runtime Application Self-Protection)',
          'Geo-blocking by country/IP',
          'Rate limiting (100 req/min)',
          'DDoS mitigation',
          'Encrypted cloud backups',
        ]
      },
      {
        layer: 'Layer 5',
        title: 'Monitoring & Detection',
        color: [255, 180, 80],
        items: [
          'Immutable audit logging',
          'Anomaly detection algorithms',
          'Fraud risk scoring',
          'Real-time SMS/email alerts',
          'Suspicious address screening',
        ]
      },
    ];

    // Draw security layers as concentric visualization
    securityLayers.forEach((sec, idx) => {
      const x = margin + (idx % 2) * 145;
      const yPos = y + Math.floor(idx / 2) * 65;

      // Layer box with gradient color
      doc.setFillColor(...sec.color);
      doc.roundedRect(x, yPos, 140, 60, 2, 2, 'F');
      
      // Header bar
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(x, yPos, 140, 8, 2, 2, 'F');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${sec.layer}: ${sec.title}`, x + 5, yPos + 5.5);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      let itemY = yPos + 16;
      sec.items.forEach((item) => {
        doc.text('• ' + item, x + 5, itemY);
        itemY += 5;
      });
    });

    y += 135;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Figure 3: Defense-in-Depth Security Architecture', margin, y);

    // Page 7: Deployment Architecture
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Deployment Architecture', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Cloud-Native Deployment Topology:', margin, y);
    y += 10;

    const deploymentInfo = [
      {
        title: 'Frontend (PWA)',
        subtitle: 'React + Vite + Tailwind',
        items: [
          'Hosting: Base44 Platform CDN',
          'PWA: Offline service workers',
          'Lazy loading + code splitting',
          'Responsive: Mobile-first design',
          'Installable: iOS/Android home screen',
        ]
      },
      {
        title: 'Backend (Serverless)',
        subtitle: 'Deno Functions',
        items: [
          'Runtime: Deno v2 (secure sandbox)',
          'Auto-scaling: On-demand scaling',
          'Cold start: <100ms optimization',
          'Isolation: Per-function sandbox',
          'Logging: Centralized aggregation',
        ]
      },
      {
        title: 'Database (NoSQL)',
        subtitle: 'Base44 Entities',
        items: [
          'Type: Document-oriented NoSQL',
          'Replication: Multi-region',
          'Security: Row-Level Security',
          'Backup: Daily automated snapshots',
          'Indexing: Auto on common fields',
        ]
      },
      {
        title: 'CDN & Edge',
        subtitle: 'Global Distribution',
        items: [
          'Static assets: Global CDN cache',
          'SSL/TLS: End-to-end encryption',
          'DDoS: Automatic mitigation',
          'Geo-routing: Latency optimization',
          'Edge functions: API caching',
        ]
      },
    ];

    deploymentInfo.forEach((section, idx) => {
      const x = margin + (idx % 2) * 145;
      const yPos = y + Math.floor(idx / 2) * 70;

      doc.setFillColor(245, 245, 245);
      doc.roundedRect(x, yPos, 140, 65, 2, 2, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, yPos, 140, 65, 2, 2, 'S');

      // Header bar
      doc.setFillColor(255, 107, 53);
      doc.roundedRect(x, yPos, 140, 10, 2, 2, 'F');

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(section.title, x + 5, yPos + 6.5);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(section.subtitle, x + 135, yPos + 6.5, { align: 'right' });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      let itemY = yPos + 18;
      section.items.forEach((item) => {
        doc.text('• ' + item, x + 5, itemY);
        itemY += 5;
      });
    });

    y += 145;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Figure 4: Cloud-Native Deployment Architecture', margin, y);

    // Page 8: Integration Points
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Integration Points', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('External Service Integrations:', margin, y);
    y += 10;

    const integrations = [
      {
        category: '🔗 Blockchain Networks',
        items: [
          'Ethereum: Mainnet/Goerli/Sepolia via ethers.js v6',
          'Bitcoin: Blockchain.com API + Electrum server',
          'Solana: Solana Web3.js + Helius RPC',
          'Polygon: Infura + Alchemy endpoints',
          'BSC: Binance RPC + QuickNode',
          'Cosmos: CosmJS + Keplr wallet integration',
          'Tron: TronWeb + TronGrid',
          'Sui: Sui SDK + Mysten Labs RPC',
        ]
      },
      {
        category: '🔄 DEX Aggregators',
        items: [
          '1inch: Best-price routing across DEXs',
          'Uniswap V3: Direct swaps on Ethereum',
          'PancakeSwap: BSC native swaps',
          'Jupiter: Solana swap aggregator',
          '0x Protocol: Multi-chain liquidity',
        ]
      },
      {
        category: '💳 Fiat On/Off-Ramps',
        items: [
          'Stripe: Credit/debit card payments',
          'Plaid: Bank account linking (US/EU)',
          'MoonPay: Fiat-to-crypto gateway',
          'Ramp Network: SEPA/SWIFT transfers',
          'Transak: Global fiat rails (100+ countries)',
        ]
      },
      {
        category: '📊 Price Feeds & Data',
        items: [
          'CoinGecko: Real-time price feeds (5000+ coins)',
          'CoinMarketCap: Market cap & volume data',
          'Chainlink: Decentralized oracle prices',
          'Binance API: Exchange rate reference',
        ]
      },
      {
        category: '🆔 Identity & KYC',
        items: [
          'Sumsub: Identity verification + liveness check',
          'Onfido: Document verification',
          'Jumio: KYC/AML screening',
          'ENS: Ethereum Name Service resolution',
          'SNS: Solana Name Service resolution',
        ]
      },
      {
        category: '📬 Notifications',
        items: [
          'SendGrid: Transactional email delivery',
          'Twilio: SMS notifications',
          'Telegram Bot API: Bot notifications',
          'WhatsApp Business API: Message delivery',
          'Firebase Cloud Messaging: Push notifications',
        ]
      },
    ];

    integrations.forEach((section, idx) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = margin;
      }

      // Category header with icon
      doc.setFillColor(255, 245, 240);
      doc.roundedRect(margin, y, pageWidth - (margin * 2), 28, 2, 2, 'F');
      doc.setDrawColor(255, 107, 53);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, pageWidth - (margin * 2), 28, 2, 2, 'S');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 107, 53);
      doc.text(section.category, margin + 5, y + 9);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      let itemY = y + 19;
      section.items.forEach((item) => {
        if (itemY > pageHeight - 15) {
          doc.addPage();
          itemY = margin + 28;
        }
        doc.text('• ' + item, margin + 5, itemY);
        itemY += 5;
      });

      y += (section.items.length * 5) + 33;
    });

    // Page 9: Summary & Key Metrics
    doc.addPage();
    y = margin;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Architecture Summary', margin, y);
    y += 12;
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Key Metrics Table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Architecture Metrics:', margin, y);
    y += 10;

    const metrics = [
      { label: 'Total Pages', value: '40+' },
      { label: 'UI Components', value: '60+' },
      { label: 'Entity Types', value: '40+' },
      { label: 'Backend Functions', value: '8' },
      { label: 'Blockchain Networks', value: '8' },
      { label: 'Security Layers', value: '5' },
      { label: 'Integration Categories', value: '6' },
      { label: 'External Services', value: '30+' },
    ];

    // Draw metrics table
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 50, 2, 2, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 50, 2, 2, 'S');

    let metricX = margin + 10;
    const metricWidth = (pageWidth - (margin * 2) - 20) / 4;
    
    metrics.forEach((metric, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x = margin + 10 + (col * ((pageWidth - (margin * 2) - 20) / 4));
      const yPos = y + 10 + (row * 20);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 107, 53);
      doc.text(metric.value, x, yPos);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(metric.label, x, yPos + 6);
    });

    y += 60;

    // Architecture Highlights
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Architecture Highlights:', margin, y);
    y += 10;

    const highlights = [
      '✓ Multi-chain support for 8+ blockchain networks',
      '✓ Enterprise-grade security with 5-layer defense model',
      '✓ Cloud-native serverless architecture with auto-scaling',
      '✓ Progressive Web App with offline capabilities',
      '✓ Real-time price alerts and portfolio tracking',
      '✓ Comprehensive audit logging and compliance',
      '✓ OAuth integrations for Google Drive and more',
      '✓ AI-powered portfolio insights and recommendations',
    ];

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    highlights.forEach((item) => {
      doc.text(item, margin, y);
      y += 6;
    });

    y += 15;

    // Technology Stack Summary
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Technology Stack:', margin, y);
    y += 10;

    const techStack = [
      { category: 'Frontend', tech: 'React 18, Vite, Tailwind CSS, TypeScript' },
      { category: 'Backend', tech: 'Deno, Base44 Functions, Node.js APIs' },
      { category: 'Database', tech: 'Base44 Entities (NoSQL), Row-Level Security' },
      { category: 'Blockchain', tech: 'ethers.js, Web3.js, Solana Web3, CosmJS' },
      { category: 'UI/UX', tech: 'Radix UI, Framer Motion, Recharts' },
      { category: 'Security', tech: 'WebAuthn, OTP, RASP, Geo-blocking' },
    ];

    techStack.forEach((row, idx) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 107, 53);
      doc.text(row.category + ':', margin, y);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(row.tech, margin + 25, y);
      y += 6;
    });

    y += 15;

    // Conclusion
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Conclusion:', margin, y);
    y += 10;

    const conclusion = [
      'SafeDigital Wallet demonstrates a modern, production-ready cryptocurrency wallet architecture',
      'that balances security, usability, and scalability. The system leverages cloud-native technologies,',
      'multi-layer security, and comprehensive blockchain integrations to deliver a seamless user',
      'experience for managing digital assets across multiple networks.',
      '',
      'The architecture supports continuous evolution with modular design principles, enabling rapid',
      'feature development while maintaining enterprise-grade security and compliance standards.',
    ];

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'italic');
    conclusion.forEach((line) => {
      doc.text(line, margin, y);
      y += line === '' ? 8 : 5;
    });

    // Footer on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      doc.text('SafeDigital Wallet - Solution Architecture', margin, pageHeight - 10);
    }

    const pdfBytes = doc.output('arraybuffer');
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const fileName = `SafeDigitalWallet_Architecture_${new Date().toISOString().split('T')[0]}.pdf`;

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