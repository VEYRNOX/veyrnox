import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.0.0';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } from 'npm:docx@9.0.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const dateStr = new Date().toISOString().split('T')[0];

    // ========== GENERATE PDF ==========
    const pdfDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();
    const margin = 15;

    // PDF Title Page
    pdfDoc.setFillColor(255, 107, 53);
    pdfDoc.rect(0, 0, pageWidth, pageHeight, 'F');
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.setFontSize(32);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('SafeDigital Wallet', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' });
    pdfDoc.setFontSize(24);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text('Solution Architecture', pageWidth / 2, pageHeight / 2, { align: 'center' });
    pdfDoc.setFontSize(12);
    pdfDoc.setFont('helvetica', 'italic');
    pdfDoc.text('Comprehensive Architecture Documentation', pageWidth / 2, pageHeight / 2 + 20, { align: 'center' });
    pdfDoc.setFontSize(11);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(`Prepared for: ${user.full_name || user.email}`, pageWidth / 2, pageHeight / 2 + 40, { align: 'center' });
    pdfDoc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, pageHeight / 2 + 50, { align: 'center' });
    pdfDoc.text('Version 1.0', pageWidth / 2, pageHeight / 2 + 60, { align: 'center' });

    // Table of Contents
    pdfDoc.addPage();
    let y = margin;
    pdfDoc.setFontSize(20);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Table of Contents', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    const tocSections = [
      '1. Executive Summary',
      '2. Purpose, Scope, and Audience',
      '3. Business Context',
      '4. Requirements Summary',
      '5. Architecture Summary',
      '6. Assumptions, Constraints, and Dependencies',
      '7. Current-State Overview',
      '8. Target-State Solution Overview',
      '9. High-Level Architecture',
      '10. Application Component Design',
      '11. Component Architecture',
      '12. Data Flow Diagram and Workflows',
      '13. Integration Design',
      '14. Data Design',
      '15. Security Design/Architecture',
      '16. Multi-Layer Security Model',
      '17. Non-Functional Design',
      '18. Deployment and Environment Design',
      '19. Integration Points',
      '20. Operations and Support Model',
      '21. Risks, Issues, and Design Decisions',
      '22. Appendices',
    ];

    pdfDoc.setFontSize(11);
    pdfDoc.setFont('helvetica', 'normal');
    tocSections.forEach((section, idx) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.text(`${idx + 1}. ${section}`, margin, y);
      y += 7;
    });

    // 1. Executive Summary
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('1. Executive Summary', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const execSummary = [
      'SafeDigital Wallet is a comprehensive, multi-chain cryptocurrency wallet platform designed for retail and institutional users.',
      'The architecture follows modern cloud-native principles with security-first design, supporting 8+ blockchain networks.',
      '',
      'Key Capabilities:',
      '• Multi-chain asset management (Bitcoin, Ethereum, Solana, Polygon, BSC, Cosmos, Tron, Sui)',
      '• Advanced security: WebAuthn passkeys, 2FA, hardware wallet support, RASP protection',
      '• DeFi integration: Staking, lending, yield farming, DEX swaps',
      '• Portfolio management: Real-time tracking, analytics, AI-powered insights',
      '• Compliance: KYC/AML, geo-blocking, audit logging, regulatory reporting',
      '• Progressive Web App with native mobile experience',
      '',
      'Business Value:',
      '• Unified interface for managing diverse crypto assets',
      '• Enterprise-grade security with 5-layer defense model',
      '• Automated portfolio management (DCA, rebalancing, alerts)',
      '• Regulatory compliance out-of-the-box',
      '• Scalable serverless architecture with auto-scaling',
    ];

    execSummary.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont(line === '' || line.includes('Key Capabilities') || line.includes('Business Value') ? 'helvetica' : 'helvetica', line.includes('Key Capabilities') || line.includes('Business Value') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 2. Purpose, Scope, and Audience
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('2. Purpose, Scope, and Audience', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const purposeContent = [
      'Purpose:',
      'This document defines the complete architecture of SafeDigital Wallet, providing technical guidance',
      'for development, deployment, and operations teams.',
      '',
      'Scope:',
      '• Frontend application (React PWA with 40+ pages, 60+ components)',
      '• Backend services (8 Deno serverless functions)',
      '• Data layer (40+ entity types with Row-Level Security)',
      '• Security architecture (5-layer defense model)',
      '• External integrations (blockchain networks, DEXs, fiat rails, KYC providers)',
      '• Deployment topology (cloud-native, multi-region)',
      '',
      'Audience:',
      '• Development team: Implementation guidance',
      '• DevOps engineers: Deployment and operations',
      '• Security team: Security controls and compliance',
      '• Stakeholders: Technical overview and capabilities',
      '• Auditors: Architecture documentation for compliance',
    ];

    purposeContent.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Purpose') || line.includes('Scope') || line.includes('Audience') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 3. Business Context
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('3. Business Context', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const businessContext = [
      'Market Opportunity:',
      '• Growing crypto adoption: 500M+ users globally (2025)',
      '• Fragmented wallet landscape: Users manage 3-5 wallets on average',
      '• Security concerns: $3.8B lost to hacks in 2024',
      '• Regulatory pressure: Increased KYC/AML requirements',
      '',
      'Business Objectives:',
      '• Provide unified multi-chain wallet experience',
      '• Reduce security risks with enterprise-grade protection',
      '• Automate portfolio management (DCA, rebalancing)',
      '• Ensure regulatory compliance across jurisdictions',
      '• Enable institutional-grade features for retail users',
      '',
      'Success Metrics:',
      '• User adoption: 100K+ active users in Year 1',
      '• Security: Zero successful hacks or breaches',
      '• Uptime: 99.9% availability SLA',
      '• Performance: <2s page load, <100ms API response',
      '• Compliance: 100% regulatory audit pass rate',
    ];

    businessContext.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Market Opportunity') || line.includes('Business Objectives') || line.includes('Success Metrics') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 4. Requirements Summary
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('4. Requirements Summary', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const requirements = [
      'Functional Requirements:',
      'FR-1: Multi-chain wallet support (8+ networks)',
      'FR-2: Send/receive crypto with ENS/SNS resolution',
      'FR-3: Cross-chain swaps via DEX aggregators',
      'FR-4: Staking, lending, yield farming',
      'FR-5: Real-time portfolio tracking and analytics',
      'FR-6: Price alerts and notifications',
      'FR-7: Automated DCA and rebalancing',
      'FR-8: KYC/AML verification integration',
      'FR-9: Fiat on/off-ramp (cards, bank transfers)',
      'FR-10: NFT portfolio management',
      '',
      'Non-Functional Requirements:',
      'NFR-1: Security - 5-layer defense model',
      'NFR-2: Performance - <2s page load time',
      'NFR-3: Availability - 99.9% uptime SLA',
      'NFR-4: Scalability - Auto-scaling to 100K users',
      'NFR-5: Compliance - KYC/AML, geo-blocking',
      'NFR-6: Auditability - Immutable audit logs',
      'NFR-7: Usability - Intuitive UX, PWA installable',
      'NFR-8: Maintainability - Modular, documented code',
    ];

    requirements.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Functional Requirements') || line.includes('Non-Functional Requirements') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 5. Architecture Summary
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('5. Architecture Summary', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const archSummary = [
      'Architectural Style:',
      '• Cloud-native serverless architecture',
      '• Event-driven design with async processing',
      '• Microservices-inspired modularity',
      '• RESTful API patterns',
      '',
      'Key Components:',
      '• Frontend: React 18 + Vite + Tailwind CSS (PWA)',
      '• Backend: Deno serverless functions (Base44 Platform)',
      '• Database: Base44 Entities (NoSQL with RLS)',
      '• CDN: Global edge distribution',
      '',
      'Architecture Metrics:',
      '• 40+ pages, 60+ UI components',
      '• 8 backend functions',
      '• 40+ entity types',
      '• 8 blockchain networks',
      '• 30+ external service integrations',
      '• 5 security layers',
    ];

    archSummary.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Architectural Style') || line.includes('Key Components') || line.includes('Architecture Metrics') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 6. Assumptions, Constraints, and Dependencies
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('6. Assumptions, Constraints, and Dependencies', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const assumptions = [
      'Assumptions:',
      '• Users have internet connectivity',
      '• Blockchain networks remain operational',
      '• Third-party APIs (price feeds, KYC) maintain SLAs',
      '• Base44 Platform provides 99.9% uptime',
      '• Regulatory environment remains stable',
      '',
      'Constraints:',
      '• Budget: Development within allocated resources',
      '• Timeline: Phased rollout over 12 months',
      '• Compliance: Must adhere to local regulations',
      '• Technology: Base44 Platform dependencies',
      '',
      'Dependencies:',
      '• Blockchain RPC providers (Infura, Alchemy, Helius)',
      '• Price feed APIs (CoinGecko, CoinMarketCap)',
      '• KYC providers (Sumsub, Onfido)',
      '• Fiat ramps (Stripe, Plaid, MoonPay)',
      '• Notification services (SendGrid, Twilio, Firebase)',
    ];

    assumptions.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Assumptions') || line.includes('Constraints') || line.includes('Dependencies') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 7. Current-State Overview
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('7. Current-State Overview', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const currentState = [
      'As-Build State:',
      '• Greenfield development (no legacy system)',
      '• Base44 Platform infrastructure established',
      '• Core wallet functionality implemented',
      '• Security controls deployed (passkeys, 2FA, RLS)',
      '',
      'Existing Capabilities:',
      '• Multi-chain wallet support (8 networks)',
      '• Send/receive transactions',
      '• Portfolio tracking dashboard',
      '• Price alerts and notifications',
      '• KYC verification workflow',
      '• Google Drive integration (OAuth)',
      '',
      'Technical Debt:',
      '• Minimal (new system)',
      '• Documentation gaps being addressed',
      '• Test coverage improving',
    ];

    currentState.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('As-Build State') || line.includes('Existing Capabilities') || line.includes('Technical Debt') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 8. Target-State Solution Overview
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('8. Target-State Solution Overview', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const targetState = [
      'Target Architecture Vision:',
      '• Production-ready multi-chain wallet platform',
      '• Enterprise-grade security and compliance',
      '• Scalable to 100K+ active users',
      '• Comprehensive DeFi integration',
      '',
      'Key Features:',
      '• Unified multi-chain interface',
      '• Advanced security (5-layer defense)',
      '• Automated portfolio management',
      '• Real-time analytics and AI insights',
      '• Regulatory compliance automation',
      '• Mobile-first PWA experience',
      '',
      'Target Capabilities:',
      '• 40+ functional pages',
      '• 60+ reusable components',
      '• 8 backend automation functions',
      '• 40+ entity types with RLS',
      '• 30+ external integrations',
    ];

    targetState.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Target Architecture Vision') || line.includes('Key Features') || line.includes('Target Capabilities') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 9. High-Level Architecture
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('9. High-Level Architecture', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    pdfDoc.setFontSize(12);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Architecture Diagram:', margin, y);
    y += 10;
    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');

    // Draw simple architecture diagram
    const drawBox = (x, yPos, w, h, text, subtext) => {
      pdfDoc.setFillColor(255, 245, 240);
      pdfDoc.roundedRect(x, yPos, w, h, 2, 2, 'F');
      pdfDoc.setDrawColor(255, 107, 53);
      pdfDoc.setLineWidth(1);
      pdfDoc.roundedRect(x, yPos, w, h, 2, 2, 'S');
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(255, 107, 53);
      pdfDoc.text(text, x + w / 2, yPos + h / 2 - 3, { align: 'center' });
      pdfDoc.setFontSize(8);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(subtext, x + w / 2, yPos + h / 2 + 4, { align: 'center' });
    };

    drawBox(margin, y, 60, 20, 'Users', 'Browser/Mobile');
    drawBox(margin + 70, y, 60, 20, 'CDN', 'Edge Cache');
    drawBox(margin, y + 30, 60, 20, 'Frontend', 'React PWA');
    drawBox(margin + 70, y + 30, 60, 20, 'Backend', 'Deno Functions');
    drawBox(margin, y + 60, 60, 20, 'Database', 'Base44 Entities');
    drawBox(margin + 70, y + 60, 60, 20, 'Blockchain', '8 Networks');

    // Arrows
    pdfDoc.setDrawColor(150, 150, 150);
    pdfDoc.setLineWidth(0.5);
    pdfDoc.line(margin + 30, y + 20, margin + 30, y + 30);
    pdfDoc.line(margin + 100, y + 20, margin + 100, y + 30);
    pdfDoc.line(margin + 30, y + 50, margin + 30, y + 60);
    pdfDoc.line(margin + 100, y + 50, margin + 100, y + 60);
    pdfDoc.line(margin + 60, y + 40, margin + 70, y + 40);

    y += 95;
    pdfDoc.setFontSize(9);
    pdfDoc.text('User → CDN → Frontend → Backend → Database/Blockchain', margin, y);
    y += 10;

    const hlaContent = [
      '',
      'Layer 1: User Interface',
      '• Progressive Web App (installable)',
      '• Responsive design (mobile/tablet/desktop)',
      '• Offline capabilities via service workers',
      '',
      'Layer 2: CDN & Edge',
      '• Global content distribution',
      '• SSL/TLS termination',
      '• DDoS mitigation',
      '',
      'Layer 3: Application',
      '• React components (60+)',
      '• State management (React Query)',
      '• Backend functions (8)',
      '',
      'Layer 4: Data',
      '• NoSQL database (40+ entities)',
      '• Row-Level Security',
      '• Blockchain RPC endpoints',
    ];

    hlaContent.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Layer') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 10. Application Component Design
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('10. Application Component Design', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const appComponents = [
      'Frontend Architecture:',
      '• Component-based design (React 18)',
      '• Atomic design principles (atoms, molecules, organisms)',
      '• Reusable UI library (60+ components)',
      '• Page composition (40+ pages)',
      '',
      'Component Categories:',
      '• Layout: Sidebar, mobile tabs, headers',
      '• Navigation: Command palette, breadcrumbs',
      '• Data Display: Cards, tables, charts, badges',
      '• Forms: Inputs, selects, validators',
      '• Feedback: Toasts, alerts, dialogs',
      '• Security: MFA dialogs, passkey setup',
      '',
      'State Management:',
      '• Server state: React Query (caching, sync)',
      '• Local state: useState, useReducer',
      '• Preferences: localStorage (theme, currency)',
      '• Auth: JWT tokens, session management',
    ];

    appComponents.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Frontend Architecture') || line.includes('Component Categories') || line.includes('State Management') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 11. Component Architecture
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('11. Component Architecture', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    const componentDetails = [
      { title: 'Pages (40+)', items: ['Dashboard, Send, Receive, Swap', 'Staking, Lending, Yield Farming', 'NFT Gallery, Analytics', 'Security Center, Settings'] },
      { title: 'UI Components (60+)', items: ['Cards, Buttons, Inputs, Selects', 'Tables, Charts, Badges', 'Dialogs, Drawers, Sheets', 'Toasts, Alerts, Progress'] },
      { title: 'Layout Components', items: ['Sidebar (collapsible)', 'Mobile bottom tabs nav', 'Header with account info', 'Command palette'] },
      { title: 'Feature Components', items: ['WalletCard, TransactionList', 'PortfolioChart, AssetDistribution', 'GasTracker, CryptoNewsFeed', 'QRScanner, WhitelistManager'] },
    ];

    componentDetails.forEach((section) => {
      if (y > pageHeight - 50) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFillColor(255, 245, 240);
      pdfDoc.roundedRect(margin, y, pageWidth - (margin * 2), 25, 2, 2, 'F');
      pdfDoc.setFontSize(13);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(255, 107, 53);
      pdfDoc.text(section.title, margin + 5, y + 8);
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      let itemY = y + 15;
      section.items.forEach((item) => {
        if (itemY > pageHeight - 20) { pdfDoc.addPage(); itemY = margin + 25; }
        pdfDoc.text('• ' + item, margin + 5, itemY);
        itemY += 5;
      });
      y += (section.items.length * 5) + 35;
    });

    // 12. Data Flow Diagram and Workflows
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('12. Data Flow Diagram and Workflows', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    pdfDoc.setFontSize(12);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Primary Data Flows:', margin, y);
    y += 10;
    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');

    // Draw data flow diagram
    const drawFlowBox = (x, yPos, w, h, text) => {
      pdfDoc.setFillColor(255, 245, 240);
      pdfDoc.roundedRect(x, yPos, w, h, 2, 2, 'F');
      pdfDoc.setDrawColor(255, 107, 53);
      pdfDoc.setLineWidth(1);
      pdfDoc.roundedRect(x, yPos, w, h, 2, 2, 'S');
      pdfDoc.setFontSize(9);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(255, 107, 53);
      pdfDoc.text(text, x + w / 2, yPos + h / 2, { align: 'center' });
    };

    drawFlowBox(margin, y, 45, 15, 'User');
    drawFlowBox(margin + 55, y, 45, 15, 'Frontend');
    drawFlowBox(margin + 110, y, 45, 15, 'Backend');
    drawFlowBox(margin + 155, y, 30, 15, 'DB');

    // Arrows
    pdfDoc.setDrawColor(255, 107, 53);
    pdfDoc.setLineWidth(1);
    pdfDoc.line(margin + 45, y + 7.5, margin + 55, y + 7.5);
    pdfDoc.line(margin + 100, y + 7.5, margin + 110, y + 7.5);
    pdfDoc.line(margin + 155, y + 7.5, margin + 165, y + 7.5);

    y += 25;
    const workflows = [
      'Workflow 1: Send Transaction',
      'User → Frontend (input) → Backend (validation) → Blockchain (broadcast) → DB (record) → User (confirmation)',
      '',
      'Workflow 2: Portfolio Update',
      'Price Feed API → Backend (calculate) → DB (update snapshots) → Frontend (refresh) → User (view)',
      '',
      'Workflow 3: Price Alert',
      'Price Feed → Backend (check thresholds) → Notification Service → User (SMS/email/push)',
      '',
      'Workflow 4: DCA Execution',
      'Schedule Trigger → Backend (validate) → DEX (execute swap) → DB (record) → User (notification)',
    ];

    workflows.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Workflow') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    y += 10;
    pdfDoc.setFontSize(11);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Key Workflow Characteristics:', margin, y);
    y += 8;
    pdfDoc.setFontSize(9);
    pdfDoc.setFont('helvetica', 'normal');
    const workflowChars = [
      '• Synchronous: User-facing operations (send, swap, login)',
      '• Asynchronous: Background jobs (DCA, rebalancing, alerts)',
      '• Event-driven: Price updates, notifications, audit logging',
      '• Transactional: Blockchain operations with rollback on failure',
      '• Cached: Price feeds, portfolio data (TTL: 60s)',
    ];
    workflowChars.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.text(line, margin, y);
      y += 6;
    });

    // 13. Integration Design
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('13. Integration Design', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const integrationDesign = [
      'Integration Patterns:',
      '• RESTful APIs for external services',
      '• OAuth 2.0 for user-authorized connections',
      '• Webhooks for real-time events',
      '• RPC endpoints for blockchain interaction',
      '',
      'Integration Categories:',
      '• Blockchain: ethers.js, Web3.js, Solana Web3',
      '• DEX Aggregators: 1inch, Uniswap, Jupiter',
      '• Fiat Rails: Stripe, Plaid, MoonPay',
      '• Price Feeds: CoinGecko, Chainlink',
      '• KYC: Sumsub, Onfido, Jumio',
      '• Notifications: SendGrid, Twilio, Firebase',
      '',
      'API Management:',
      '• Rate limiting (100 req/min per user)',
      '• Retry logic with exponential backoff',
      '• Circuit breaker for failing services',
      '• Centralized error handling',
    ];

    integrationDesign.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Integration Patterns') || line.includes('Integration Categories') || line.includes('API Management') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 13. Data Design
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('13. Data Design', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const dataDesign = [
      'Database Architecture:',
      '• NoSQL document-oriented (Base44 Entities)',
      '• Row-Level Security (RLS) policies',
      '• Multi-region replication',
      '• Daily automated backups',
      '',
      'Entity Categories (40+):',
      '• Core: Wallet, Transaction, AddressBook, NetworkConfig',
      '• Security: WhitelistedAddress, AuditLog, UserSession',
      '• Portfolio: PortfolioSnapshot, SavingsGoal, NetWorthAsset',
      '• DeFi: StakingPosition, LendingPosition, YieldFarmPosition',
      '• Trading: PriceAlert, TradeSignal, DCASchedule',
      '• NFT: NFTAsset, NFTGallery',
      '',
      'Data Governance:',
      '• User-owned data (created_by_id enforcement)',
      '• Immutable audit logs',
      '• Encrypted sensitive fields',
      '• GDPR compliance (data export/deletion)',
    ];

    dataDesign.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Database Architecture') || line.includes('Entity Categories') || line.includes('Data Governance') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 15. Security Design/Architecture
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('15. Security Design/Architecture', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    const securityLayers = [
      { layer: 'Layer 1', title: 'Authentication', items: ['WebAuthn/FIDO2 Passkeys', 'Email OTP (6-digit)', 'Device fingerprinting', 'Session management'] },
      { layer: 'Layer 2', title: 'Authorization', items: ['Row-Level Security', 'Role-based access (admin/user)', 'Entity CRUD permissions', 'OAuth scoping'] },
      { layer: 'Layer 3', title: 'Transaction Security', items: ['Address whitelisting', 'TX limits (daily/per-tx)', 'Multi-sig support', 'Hardware wallet integration'] },
      { layer: 'Layer 4', title: 'Infrastructure', items: ['RASP protection', 'Geo-blocking by country', 'Rate limiting (100 req/min)', 'DDoS mitigation'] },
      { layer: 'Layer 5', title: 'Monitoring', items: ['Immutable audit logging', 'Anomaly detection', 'Fraud risk scoring', 'Real-time alerts'] },
    ];

    securityLayers.forEach((sec, idx) => {
      if (y > pageHeight - 70) { pdfDoc.addPage(); y = margin; }
      const x = margin + (idx % 2) * 95;
      const yPos = y + Math.floor(idx / 2) * 65;
      pdfDoc.setFillColor(255, 100 + idx * 20, 80);
      pdfDoc.roundedRect(x, yPos, 90, 60, 2, 2, 'F');
      pdfDoc.setFillColor(0, 0, 0);
      pdfDoc.roundedRect(x, yPos, 90, 8, 2, 2, 'F');
      pdfDoc.setFontSize(9);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.text(`${sec.layer}: ${sec.title}`, x + 3, yPos + 5.5);
      pdfDoc.setFontSize(7);
      pdfDoc.setFont('helvetica', 'normal');
      let itemY = yPos + 14;
      sec.items.forEach((item) => {
        pdfDoc.text('• ' + item, x + 3, itemY);
        itemY += 4;
      });
    });

    y += 145;
    pdfDoc.setFontSize(10);
    pdfDoc.text('Defense-in-Depth: 5 independent security layers', margin, y);

    // 16. Multi-Layer Security Model
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('16. Multi-Layer Security Model', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    pdfDoc.setFontSize(12);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Comprehensive Security Architecture:', margin, y);
    y += 10;
    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');

    const securityModelContent = [
      'Layer 1: Perimeter Security',
      '• DDoS Protection: Automatic mitigation at CDN edge',
      '• Geo-Blocking: Country/IP-based access control',
      '• Rate Limiting: 100 requests/minute per user',
      '• WAF: Web Application Firewall rules',
      '',
      'Layer 2: Network Security',
      '• SSL/TLS: End-to-end encryption (TLS 1.3)',
      '• VPC Isolation: Private network segments',
      '• Firewall Rules: Ingress/egress controls',
      '• VPN Access: Admin-only secure tunnels',
      '',
      'Layer 3: Application Security',
      '• Input Validation: Sanitize all user inputs',
      '• OWASP Top 10: Protection against common attacks',
      '• RASP: Runtime Application Self-Protection',
      '• CSP: Content Security Policy headers',
      '• CORS: Strict cross-origin policies',
      '',
      'Layer 4: Data Security',
      '• Encryption at Rest: AES-256 for database',
      '• Encryption in Transit: TLS for all communications',
      '• Tokenization: Sensitive data masking',
      '• Key Management: HSM-backed key storage',
      '• Row-Level Security: User data isolation',
      '',
      'Layer 5: Access Security',
      '• Authentication: WebAuthn/FIDO2 passkeys, 2FA',
      '• Authorization: Role-based access control (RBAC)',
      '• Session Management: JWT with short expiry',
      '• Device Trust: Fingerprinting and recognition',
      '',
      'Layer 6: Transaction Security',
      '• Address Whitelisting: Pre-approved recipients',
      '• Transaction Limits: Daily/per-transaction caps',
      '• Multi-Signature: Required for large transfers',
      '• Hardware Wallet: Ledger/Trezor integration',
      '• 2FA Confirmation: Required for all sends',
      '',
      'Layer 7: Monitoring & Detection',
      '• Audit Logging: Immutable event records',
      '• Anomaly Detection: ML-based fraud detection',
      '• Risk Scoring: Real-time transaction scoring',
      '• SIEM: Security Information & Event Management',
      '• Alerting: Real-time SMS/email notifications',
    ];

    securityModelContent.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Layer') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 17. Non-Functional Design
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('15. Non-Functional Design', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const nfd = [
      'Performance:',
      '• Page load: <2s (3G network)',
      '• API response: <100ms (p95)',
      '• Time to interactive: <3s',
      '• Lighthouse score: >90',
      '',
      'Scalability:',
      '• Horizontal auto-scaling (serverless)',
      '• Support 100K+ concurrent users',
      '• Database read replicas',
      '• CDN edge caching',
      '',
      'Reliability:',
      '• 99.9% uptime SLA',
      '• Multi-region failover',
      '• Daily backups (30-day retention)',
      '• Graceful degradation',
      '',
      'Maintainability:',
      '• Modular component design',
      '• Comprehensive documentation',
      '• Automated testing (80% coverage)',
      '• CI/CD pipelines',
      '',
      'Usability:',
      '• WCAG 2.1 AA accessibility',
      '• Mobile-first responsive design',
      '• PWA installable on iOS/Android',
      '• Intuitive navigation',
    ];

    nfd.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Performance') || line.includes('Scalability') || line.includes('Reliability') || line.includes('Maintainability') || line.includes('Usability') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 16. Deployment and Environment Design
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('16. Deployment and Environment Design', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    const deploymentInfo = [
      { title: 'Frontend (PWA)', subtitle: 'React + Vite + Tailwind', items: ['Base44 CDN', 'Offline service workers', 'Code splitting', 'Mobile-first'] },
      { title: 'Backend (Serverless)', subtitle: 'Deno Functions', items: ['Deno v2 sandbox', 'Auto-scaling', '<100ms cold start', 'Centralized logging'] },
      { title: 'Database (NoSQL)', subtitle: 'Base44 Entities', items: ['Document-oriented', 'Multi-region', 'Row-Level Security', 'Daily backups'] },
      { title: 'CDN & Edge', subtitle: 'Global Distribution', items: ['Global CDN', 'SSL/TLS encryption', 'DDoS mitigation', 'Geo-routing'] },
    ];

    deploymentInfo.forEach((section, idx) => {
      const x = margin + (idx % 2) * 95;
      const yPos = y + Math.floor(idx / 2) * 70;
      pdfDoc.setFillColor(245, 245, 245);
      pdfDoc.roundedRect(x, yPos, 90, 65, 2, 2, 'F');
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.setLineWidth(0.5);
      pdfDoc.roundedRect(x, yPos, 90, 65, 2, 2, 'S');
      pdfDoc.setFillColor(255, 107, 53);
      pdfDoc.roundedRect(x, yPos, 90, 10, 2, 2, 'F');
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.text(section.title, x + 3, yPos + 6.5);
      pdfDoc.setFontSize(8);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(section.subtitle, x + 85, yPos + 6.5, { align: 'right' });
      let itemY = yPos + 18;
      section.items.forEach((item) => {
        pdfDoc.text('• ' + item, x + 3, itemY);
        itemY += 5;
      });
    });

    y += 150;
    pdfDoc.setFontSize(10);
    pdfDoc.text('Environments: Development → Staging → Production', margin, y);

    // 19. Integration Points
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('17. Integration Points', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 15;

    const integrations = [
      { category: 'Blockchain Networks', items: ['Ethereum, Bitcoin, Solana', 'Polygon, BSC, Cosmos', 'Tron, Sui'] },
      { category: 'DEX Aggregators', items: ['1inch, Uniswap V3', 'PancakeSwap, Jupiter', '0x Protocol'] },
      { category: 'Fiat Rails', items: ['Stripe, Plaid', 'MoonPay, Ramp', 'Transak'] },
      { category: 'Price Feeds', items: ['CoinGecko, CoinMarketCap', 'Chainlink, Binance API'] },
      { category: 'KYC/Identity', items: ['Sumsub, Onfido, Jumio', 'ENS, SNS'] },
      { category: 'Notifications', items: ['SendGrid, Twilio', 'Telegram, WhatsApp, Firebase'] },
    ];

    integrations.forEach((section) => {
      if (y > pageHeight - 50) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFillColor(255, 245, 240);
      pdfDoc.roundedRect(margin, y, pageWidth - (margin * 2), 28, 2, 2, 'F');
      pdfDoc.setDrawColor(255, 107, 53);
      pdfDoc.setLineWidth(1);
      pdfDoc.roundedRect(margin, y, pageWidth - (margin * 2), 28, 2, 2, 'S');
      pdfDoc.setFontSize(12);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(255, 107, 53);
      pdfDoc.text(section.category, margin + 5, y + 9);
      pdfDoc.setFontSize(9);
      pdfDoc.setFont('helvetica', 'normal');
      let itemY = y + 19;
      section.items.forEach((item) => {
        if (itemY > pageHeight - 15) { pdfDoc.addPage(); itemY = margin + 28; }
        pdfDoc.text('• ' + item, margin + 5, itemY);
        itemY += 5;
      });
      y += (section.items.length * 5) + 33;
    });

    // 18. Operations and Support Model
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('18. Operations and Support Model', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const opsModel = [
      'Monitoring & Alerting:',
      '• Application performance monitoring (APM)',
      '• Error tracking and logging',
      '• Uptime monitoring (99.9% SLA)',
      '• Real-time alerts (SMS/email)',
      '',
      'Incident Response:',
      '• Severity classification (P1-P4)',
      '• On-call rotation',
      '• Post-incident reviews',
      '• Runbook documentation',
      '',
      'Support Tiers:',
      '• Tier 1: Self-service (FAQ, docs)',
      '• Tier 2: Email/chat support',
      '• Tier 3: Technical escalation',
      '• Tier 4: Engineering escalation',
      '',
      'Maintenance:',
      '• Scheduled maintenance windows',
      '• Blue-green deployments',
      '• Rollback procedures',
      '• Change management process',
    ];

    opsModel.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Monitoring') || line.includes('Incident Response') || line.includes('Support Tiers') || line.includes('Maintenance') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 19. Risks, Issues, and Design Decisions
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('19. Risks, Issues, and Design Decisions', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const risks = [
      'Technical Risks:',
      '• Blockchain network congestion → High gas fees',
      '• Smart contract vulnerabilities → Asset loss',
      '• API rate limits → Service degradation',
      '• Mitigation: Multi-provider failover, gas optimization',
      '',
      'Security Risks:',
      '• Phishing attacks → Credential theft',
      '• Private key compromise → Asset theft',
      '• DDoS attacks → Service outage',
      '• Mitigation: 5-layer security, user education',
      '',
      'Compliance Risks:',
      '• Regulatory changes → Feature restrictions',
      '• Sanctions violations → Legal penalties',
      '• Data privacy breaches → GDPR fines',
      '• Mitigation: Compliance monitoring, legal review',
      '',
      'Key Design Decisions:',
      '• Serverless over containers → Lower ops overhead',
      '• NoSQL over SQL → Flexible schema, RLS',
      '• PWA over native apps → Faster iteration',
      '• Multi-chain over single-chain → User choice',
    ];

    risks.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Technical Risks') || line.includes('Security Risks') || line.includes('Compliance Risks') || line.includes('Key Design Decisions') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // 22. Appendices
    pdfDoc.addPage();
    y = margin;
    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('22. Appendices', margin, y);
    y += 12;
    pdfDoc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const appendices = [
      'Appendix A: Glossary',
      '• DCA: Dollar-Cost Averaging',
      '• DEX: Decentralized Exchange',
      '• KYC/AML: Know Your Customer / Anti-Money Laundering',
      '• PWA: Progressive Web App',
      '• RLS: Row-Level Security',
      '• RASP: Runtime Application Self-Protection',
      '• WebAuthn: Web Authentication API',
      '',
      'Appendix B: References',
      '• Base44 Platform Documentation',
      '• React Documentation (react.dev)',
      '• Ethereum Documentation (ethereum.org)',
      '• OWASP Security Guidelines',
      '',
      'Appendix C: Revision History',
      '• v1.0 (2026-05-27): Initial comprehensive architecture',
      '• Previous: Basic architecture summary',
      '',
      'Appendix D: Contact Information',
      `• Prepared for: ${user.full_name || user.email}`,
      '• Support: support@safedigitalwallet.com',
      '• Documentation: /docs page in application',
    ];

    appendices.forEach((line) => {
      if (y > pageHeight - 20) { pdfDoc.addPage(); y = margin; }
      pdfDoc.setFont('helvetica', line.includes('Appendix') ? 'bold' : 'normal');
      pdfDoc.text(line, margin, y);
      y += line === '' ? 8 : 6;
    });

    // PDF Footer on all pages
    const totalPages = pdfDoc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdfDoc.setPage(i);
      pdfDoc.setFontSize(8);
      pdfDoc.setTextColor(150, 150, 150);
      pdfDoc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      pdfDoc.text('SafeDigital Wallet - Solution Architecture', margin, pageHeight - 10);
    }

    const pdfBytes = pdfDoc.output('arraybuffer');
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfFileName = `SafeDigitalWallet_Architecture_${dateStr}.pdf`;

    // ========== GENERATE WORD DOCUMENT ==========
    const wordDoc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: 'SafeDigital Wallet', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: 'Solution Architecture', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: 'Comprehensive Architecture Documentation', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: `Prepared for: ${user.full_name || user.email}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: 'Version 1.0', alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),

          // 1. Executive Summary
          new Paragraph({ text: '1. Executive Summary', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'SafeDigital Wallet is a comprehensive, multi-chain cryptocurrency wallet platform designed for retail and institutional users. The architecture follows modern cloud-native principles with security-first design, supporting 8+ blockchain networks.' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Key Capabilities:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Multi-chain asset management (Bitcoin, Ethereum, Solana, Polygon, BSC, Cosmos, Tron, Sui)' }),
          new Paragraph({ text: '• Advanced security: WebAuthn passkeys, 2FA, hardware wallet support, RASP protection' }),
          new Paragraph({ text: '• DeFi integration: Staking, lending, yield farming, DEX swaps' }),
          new Paragraph({ text: '• Portfolio management: Real-time tracking, analytics, AI-powered insights' }),
          new Paragraph({ text: '• Compliance: KYC/AML, geo-blocking, audit logging, regulatory reporting' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Business Value:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Unified interface for managing diverse crypto assets' }),
          new Paragraph({ text: '• Enterprise-grade security with 5-layer defense model' }),
          new Paragraph({ text: '• Automated portfolio management (DCA, rebalancing, alerts)' }),
          new Paragraph({ text: '• Regulatory compliance out-of-the-box' }),
          new Paragraph({ text: '• Scalable serverless architecture with auto-scaling' }),
          new Paragraph({ text: '' }),

          // 2. Purpose, Scope, and Audience
          new Paragraph({ text: '2. Purpose, Scope, and Audience', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Purpose: This document defines the complete architecture of SafeDigital Wallet, providing technical guidance for development, deployment, and operations teams.' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Scope:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Frontend application (React PWA with 40+ pages, 60+ components)' }),
          new Paragraph({ text: '• Backend services (8 Deno serverless functions)' }),
          new Paragraph({ text: '• Data layer (40+ entity types with Row-Level Security)' }),
          new Paragraph({ text: '• Security architecture (5-layer defense model)' }),
          new Paragraph({ text: '• External integrations (blockchain networks, DEXs, fiat rails, KYC providers)' }),
          new Paragraph({ text: '• Deployment topology (cloud-native, multi-region)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Audience:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Development team: Implementation guidance' }),
          new Paragraph({ text: '• DevOps engineers: Deployment and operations' }),
          new Paragraph({ text: '• Security team: Security controls and compliance' }),
          new Paragraph({ text: '• Stakeholders: Technical overview and capabilities' }),
          new Paragraph({ text: '• Auditors: Architecture documentation for compliance' }),
          new Paragraph({ text: '' }),

          // 3. Business Context
          new Paragraph({ text: '3. Business Context', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Market Opportunity:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Growing crypto adoption: 500M+ users globally (2025)' }),
          new Paragraph({ text: '• Fragmented wallet landscape: Users manage 3-5 wallets on average' }),
          new Paragraph({ text: '• Security concerns: $3.8B lost to hacks in 2024' }),
          new Paragraph({ text: '• Regulatory pressure: Increased KYC/AML requirements' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Business Objectives:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Provide unified multi-chain wallet experience' }),
          new Paragraph({ text: '• Reduce security risks with enterprise-grade protection' }),
          new Paragraph({ text: '• Automate portfolio management (DCA, rebalancing)' }),
          new Paragraph({ text: '• Ensure regulatory compliance across jurisdictions' }),
          new Paragraph({ text: '• Enable institutional-grade features for retail users' }),
          new Paragraph({ text: '' }),

          // 4. Requirements Summary
          new Paragraph({ text: '4. Requirements Summary', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Functional Requirements:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'FR-1: Multi-chain wallet support (8+ networks)' }),
          new Paragraph({ text: 'FR-2: Send/receive crypto with ENS/SNS resolution' }),
          new Paragraph({ text: 'FR-3: Cross-chain swaps via DEX aggregators' }),
          new Paragraph({ text: 'FR-4: Staking, lending, yield farming' }),
          new Paragraph({ text: 'FR-5: Real-time portfolio tracking and analytics' }),
          new Paragraph({ text: 'FR-6: Price alerts and notifications' }),
          new Paragraph({ text: 'FR-7: Automated DCA and rebalancing' }),
          new Paragraph({ text: 'FR-8: KYC/AML verification integration' }),
          new Paragraph({ text: 'FR-9: Fiat on/off-ramp (cards, bank transfers)' }),
          new Paragraph({ text: 'FR-10: NFT portfolio management' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Non-Functional Requirements:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'NFR-1: Security - 5-layer defense model' }),
          new Paragraph({ text: 'NFR-2: Performance - <2s page load time' }),
          new Paragraph({ text: 'NFR-3: Availability - 99.9% uptime SLA' }),
          new Paragraph({ text: 'NFR-4: Scalability - Auto-scaling to 100K users' }),
          new Paragraph({ text: 'NFR-5: Compliance - KYC/AML, geo-blocking' }),
          new Paragraph({ text: 'NFR-6: Auditability - Immutable audit logs' }),
          new Paragraph({ text: 'NFR-7: Usability - Intuitive UX, PWA installable' }),
          new Paragraph({ text: 'NFR-8: Maintainability - Modular, documented code' }),
          new Paragraph({ text: '' }),

          // 5. Architecture Summary
          new Paragraph({ text: '5. Architecture Summary', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Architectural Style:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Cloud-native serverless architecture' }),
          new Paragraph({ text: '• Event-driven design with async processing' }),
          new Paragraph({ text: '• Microservices-inspired modularity' }),
          new Paragraph({ text: '• RESTful API patterns' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Key Components:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Frontend: React 18 + Vite + Tailwind CSS (PWA)' }),
          new Paragraph({ text: '• Backend: Deno serverless functions (Base44 Platform)' }),
          new Paragraph({ text: '• Database: Base44 Entities (NoSQL with RLS)' }),
          new Paragraph({ text: '• CDN: Global edge distribution' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Architecture Metrics:', heading: HeadingLevel.HEADING_2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Pages', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '40+' })] }), new TableCell({ children: [new Paragraph({ text: 'UI Components', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '60+' })] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Backend Functions', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '8' })] }), new TableCell({ children: [new Paragraph({ text: 'Entity Types', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '40+' })] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Blockchain Networks', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '8' })] }), new TableCell({ children: [new Paragraph({ text: 'Security Layers', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '5' })] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'External Integrations', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '30+' })] }), new TableCell({ children: [new Paragraph({ text: 'Availability SLA', bold: true })] }), new TableCell({ children: [new Paragraph({ text: '99.9%' })] })] }),
            ],
          }),
          new Paragraph({ text: '' }),

          // 6. Assumptions, Constraints, and Dependencies
          new Paragraph({ text: '6. Assumptions, Constraints, and Dependencies', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Assumptions:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Users have internet connectivity' }),
          new Paragraph({ text: '• Blockchain networks remain operational' }),
          new Paragraph({ text: '• Third-party APIs (price feeds, KYC) maintain SLAs' }),
          new Paragraph({ text: '• Base44 Platform provides 99.9% uptime' }),
          new Paragraph({ text: '• Regulatory environment remains stable' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Constraints:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Budget: Development within allocated resources' }),
          new Paragraph({ text: '• Timeline: Phased rollout over 12 months' }),
          new Paragraph({ text: '• Compliance: Must adhere to local regulations' }),
          new Paragraph({ text: '• Technology: Base44 Platform dependencies' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Dependencies:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Blockchain RPC providers (Infura, Alchemy, Helius)' }),
          new Paragraph({ text: '• Price feed APIs (CoinGecko, CoinMarketCap)' }),
          new Paragraph({ text: '• KYC providers (Sumsub, Onfido)' }),
          new Paragraph({ text: '• Fiat ramps (Stripe, Plaid, MoonPay)' }),
          new Paragraph({ text: '• Notification services (SendGrid, Twilio, Firebase)' }),
          new Paragraph({ text: '' }),

          // 7. Current-State Overview
          new Paragraph({ text: '7. Current-State Overview', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'As-Build State:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Greenfield development (no legacy system)' }),
          new Paragraph({ text: '• Base44 Platform infrastructure established' }),
          new Paragraph({ text: '• Core wallet functionality implemented' }),
          new Paragraph({ text: '• Security controls deployed (passkeys, 2FA, RLS)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Existing Capabilities:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Multi-chain wallet support (8 networks)' }),
          new Paragraph({ text: '• Send/receive transactions' }),
          new Paragraph({ text: '• Portfolio tracking dashboard' }),
          new Paragraph({ text: '• Price alerts and notifications' }),
          new Paragraph({ text: '• KYC verification workflow' }),
          new Paragraph({ text: '• Google Drive integration (OAuth)' }),
          new Paragraph({ text: '' }),

          // 8. Target-State Solution Overview
          new Paragraph({ text: '8. Target-State Solution Overview', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Target Architecture Vision:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Production-ready multi-chain wallet platform' }),
          new Paragraph({ text: '• Enterprise-grade security and compliance' }),
          new Paragraph({ text: '• Scalable to 100K+ active users' }),
          new Paragraph({ text: '• Comprehensive DeFi integration' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Key Features:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Unified multi-chain interface' }),
          new Paragraph({ text: '• Advanced security (5-layer defense)' }),
          new Paragraph({ text: '• Automated portfolio management' }),
          new Paragraph({ text: '• Real-time analytics and AI insights' }),
          new Paragraph({ text: '• Regulatory compliance automation' }),
          new Paragraph({ text: '• Mobile-first PWA experience' }),
          new Paragraph({ text: '' }),

          // 9. High-Level Architecture
          new Paragraph({ text: '9. High-Level Architecture', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Architecture Layers:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Layer 1: User Interface - Progressive Web App (installable), responsive design, offline capabilities' }),
          new Paragraph({ text: 'Layer 2: CDN & Edge - Global content distribution, SSL/TLS termination, DDoS mitigation' }),
          new Paragraph({ text: 'Layer 3: Application - React components (60+), state management, backend functions (8)' }),
          new Paragraph({ text: 'Layer 4: Data - NoSQL database (40+ entities), Row-Level Security, blockchain RPC endpoints' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Flow: User → CDN → Frontend → Backend → Database/Blockchain', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: '' }),

          // 10. Application Component Design
          new Paragraph({ text: '10. Application Component Design', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Frontend Architecture:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Component-based design (React 18)' }),
          new Paragraph({ text: '• Atomic design principles (atoms, molecules, organisms)' }),
          new Paragraph({ text: '• Reusable UI library (60+ components)' }),
          new Paragraph({ text: '• Page composition (40+ pages)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'State Management:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Server state: React Query (caching, sync)' }),
          new Paragraph({ text: '• Local state: useState, useReducer' }),
          new Paragraph({ text: '• Preferences: localStorage (theme, currency)' }),
          new Paragraph({ text: '• Auth: JWT tokens, session management' }),
          new Paragraph({ text: '' }),

          // 11. Component Architecture
          new Paragraph({ text: '11. Component Architecture', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Pages (40+):', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Dashboard, Send, Receive, Swap, Staking, Lending, Yield Farming, NFT Gallery, Analytics, Security Center, Settings' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'UI Components (60+):', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Cards, Buttons, Inputs, Selects, Tables, Charts, Badges, Dialogs, Drawers, Sheets, Toasts, Alerts, Progress' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Feature Components:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'WalletCard, TransactionList, PortfolioChart, AssetDistribution, GasTracker, CryptoNewsFeed, QRScanner, WhitelistManager' }),
          new Paragraph({ text: '' }),

          // 12. Data Flow Diagram and Workflows
          new Paragraph({ text: '12. Data Flow Diagram and Workflows', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Primary Data Flows:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'User → Frontend (input) → Backend (validation) → Blockchain (broadcast) → DB (record) → User (confirmation)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Key Workflows:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Workflow 1: Send Transaction - User → Frontend (input) → Backend (validation, 2FA) → Blockchain (broadcast) → DB (record) → User (confirmation)' }),
          new Paragraph({ text: 'Workflow 2: Portfolio Update - Price Feed API → Backend (calculate) → DB (update snapshots) → Frontend (refresh) → User (view)' }),
          new Paragraph({ text: 'Workflow 3: Price Alert - Price Feed → Backend (check thresholds) → Notification Service → User (SMS/email/push)' }),
          new Paragraph({ text: 'Workflow 4: DCA Execution - Schedule Trigger → Backend (validate) → DEX (execute swap) → DB (record) → User (notification)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Workflow Characteristics:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Synchronous: User-facing operations (send, swap, login)' }),
          new Paragraph({ text: '• Asynchronous: Background jobs (DCA, rebalancing, alerts)' }),
          new Paragraph({ text: '• Event-driven: Price updates, notifications, audit logging' }),
          new Paragraph({ text: '• Transactional: Blockchain operations with rollback on failure' }),
          new Paragraph({ text: '• Cached: Price feeds, portfolio data (TTL: 60s)' }),
          new Paragraph({ text: '' }),

          // 13. Integration Design
          new Paragraph({ text: '13. Integration Design', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Integration Patterns:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• RESTful APIs for external services' }),
          new Paragraph({ text: '• OAuth 2.0 for user-authorized connections' }),
          new Paragraph({ text: '• Webhooks for real-time events' }),
          new Paragraph({ text: '• RPC endpoints for blockchain interaction' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'API Management:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Rate limiting (100 req/min per user)' }),
          new Paragraph({ text: '• Retry logic with exponential backoff' }),
          new Paragraph({ text: '• Circuit breaker for failing services' }),
          new Paragraph({ text: '• Centralized error handling' }),
          new Paragraph({ text: '' }),

          // 14. Data Design
          new Paragraph({ text: '14. Data Design', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Database Architecture:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• NoSQL document-oriented (Base44 Entities)' }),
          new Paragraph({ text: '• Row-Level Security (RLS) policies' }),
          new Paragraph({ text: '• Multi-region replication' }),
          new Paragraph({ text: '• Daily automated backups' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Entity Categories (40+):', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Core: Wallet, Transaction, AddressBook, NetworkConfig' }),
          new Paragraph({ text: '• Security: WhitelistedAddress, AuditLog, UserSession' }),
          new Paragraph({ text: '• Portfolio: PortfolioSnapshot, SavingsGoal, NetWorthAsset' }),
          new Paragraph({ text: '• DeFi: StakingPosition, LendingPosition, YieldFarmPosition' }),
          new Paragraph({ text: '• Trading: PriceAlert, TradeSignal, DCASchedule' }),
          new Paragraph({ text: '• NFT: NFTAsset, NFTGallery' }),
          new Paragraph({ text: '' }),

          // 15. Security Design/Architecture
          new Paragraph({ text: '15. Security Design/Architecture', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Five-Layer Defense Model:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 1: Authentication', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'WebAuthn/FIDO2 Passkeys, Email OTP (6-digit), Device fingerprinting, Session management' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 2: Authorization', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Row-Level Security, Role-based access (admin/user), Entity CRUD permissions, OAuth scoping' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 3: Transaction Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Address whitelisting, TX limits (daily/per-tx), Multi-sig support, Hardware wallet integration, 2FA confirmation' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 4: Infrastructure', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'RASP protection, Geo-blocking by country, Rate limiting (100 req/min), DDoS mitigation, Encrypted backups' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 5: Monitoring', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Immutable audit logging, Anomaly detection, Fraud risk scoring, Real-time SMS/email alerts, Suspicious address screening' }),
          new Paragraph({ text: '' }),

          // 16. Multi-Layer Security Model
          new Paragraph({ text: '16. Multi-Layer Security Model', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Comprehensive 7-Layer Security Architecture:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 1: Perimeter Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'DDoS Protection (automatic mitigation at CDN edge), Geo-Blocking (country/IP-based), Rate Limiting (100 req/min), WAF (Web Application Firewall)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 2: Network Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'SSL/TLS (TLS 1.3 end-to-end), VPC Isolation, Firewall Rules (ingress/egress), VPN Access (admin-only)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 3: Application Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Input Validation, OWASP Top 10 Protection, RASP (Runtime Application Self-Protection), CSP headers, CORS policies' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 4: Data Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Encryption at Rest (AES-256), Encryption in Transit (TLS), Tokenization, HSM-backed Key Management, Row-Level Security' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 5: Access Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'WebAuthn/FIDO2 Passkeys, 2FA, Role-based Access Control (RBAC), JWT Session Management, Device Fingerprinting' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 6: Transaction Security', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Address Whitelisting, Transaction Limits, Multi-Signature, Hardware Wallet Integration, 2FA Confirmation for sends' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Layer 7: Monitoring & Detection', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: 'Immutable Audit Logging, ML-based Anomaly Detection, Real-time Risk Scoring, SIEM integration, SMS/email Alerting' }),
          new Paragraph({ text: '' }),

          // 17. Non-Functional Design
          new Paragraph({ text: '15. Non-Functional Design', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Performance:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Page load: <2s (3G network)' }),
          new Paragraph({ text: '• API response: <100ms (p95)' }),
          new Paragraph({ text: '• Time to interactive: <3s' }),
          new Paragraph({ text: '• Lighthouse score: >90' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Scalability:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Horizontal auto-scaling (serverless)' }),
          new Paragraph({ text: '• Support 100K+ concurrent users' }),
          new Paragraph({ text: '• Database read replicas' }),
          new Paragraph({ text: '• CDN edge caching' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Reliability:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• 99.9% uptime SLA' }),
          new Paragraph({ text: '• Multi-region failover' }),
          new Paragraph({ text: '• Daily backups (30-day retention)' }),
          new Paragraph({ text: '• Graceful degradation' }),
          new Paragraph({ text: '' }),

          // 18. Deployment and Environment Design
          new Paragraph({ text: '18. Deployment and Environment Design', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Deployment Topology:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Frontend (PWA): React + Vite + Tailwind - Base44 CDN, Offline service workers, Code splitting, Mobile-first' }),
          new Paragraph({ text: 'Backend (Serverless): Deno Functions - Deno v2 sandbox, Auto-scaling, <100ms cold start, Centralized logging' }),
          new Paragraph({ text: 'Database (NoSQL): Base44 Entities - Document-oriented, Multi-region, Row-Level Security, Daily backups' }),
          new Paragraph({ text: 'CDN & Edge: Global Distribution - Global CDN, SSL/TLS encryption, DDoS mitigation, Geo-routing' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Environments:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Development → Staging → Production' }),
          new Paragraph({ text: '' }),

          // 19. Integration Points
          new Paragraph({ text: '19. Integration Points', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Blockchain Networks:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Ethereum, Bitcoin, Solana, Polygon, BSC, Cosmos, Tron, Sui' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'DEX Aggregators:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '1inch, Uniswap V3, PancakeSwap, Jupiter, 0x Protocol' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Fiat Rails:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Stripe, Plaid, MoonPay, Ramp Network, Transak' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Price Feeds:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'CoinGecko, CoinMarketCap, Chainlink, Binance API' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'KYC/Identity:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Sumsub, Onfido, Jumio, ENS, SNS' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Notifications:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'SendGrid, Twilio, Telegram Bot API, WhatsApp Business API, Firebase Cloud Messaging' }),
          new Paragraph({ text: '' }),

          // 20. Operations and Support Model
          new Paragraph({ text: '20. Operations and Support Model', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Monitoring & Alerting:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Application performance monitoring (APM)' }),
          new Paragraph({ text: '• Error tracking and logging' }),
          new Paragraph({ text: '• Uptime monitoring (99.9% SLA)' }),
          new Paragraph({ text: '• Real-time alerts (SMS/email)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Incident Response:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Severity classification (P1-P4)' }),
          new Paragraph({ text: '• On-call rotation' }),
          new Paragraph({ text: '• Post-incident reviews' }),
          new Paragraph({ text: '• Runbook documentation' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Support Tiers:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Tier 1: Self-service (FAQ, docs)' }),
          new Paragraph({ text: '• Tier 2: Email/chat support' }),
          new Paragraph({ text: '• Tier 3: Technical escalation' }),
          new Paragraph({ text: '• Tier 4: Engineering escalation' }),
          new Paragraph({ text: '' }),

          // 21. Risks, Issues, and Design Decisions
          new Paragraph({ text: '21. Risks, Issues, and Design Decisions', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Technical Risks:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Blockchain network congestion → High gas fees' }),
          new Paragraph({ text: '• Smart contract vulnerabilities → Asset loss' }),
          new Paragraph({ text: '• API rate limits → Service degradation' }),
          new Paragraph({ text: 'Mitigation: Multi-provider failover, gas optimization' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Security Risks:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Phishing attacks → Credential theft' }),
          new Paragraph({ text: '• Private key compromise → Asset theft' }),
          new Paragraph({ text: '• DDoS attacks → Service outage' }),
          new Paragraph({ text: 'Mitigation: 5-layer security, user education' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Key Design Decisions:', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: '• Serverless over containers → Lower ops overhead' }),
          new Paragraph({ text: '• NoSQL over SQL → Flexible schema, RLS' }),
          new Paragraph({ text: '• PWA over native apps → Faster iteration' }),
          new Paragraph({ text: '• Multi-chain over single-chain → User choice' }),
          new Paragraph({ text: '' }),

          // 22. Appendices
          new Paragraph({ text: '22. Appendices', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Appendix A: Glossary', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'DCA: Dollar-Cost Averaging, DEX: Decentralized Exchange, KYC/AML: Know Your Customer / Anti-Money Laundering' }),
          new Paragraph({ text: 'PWA: Progressive Web App, RLS: Row-Level Security, RASP: Runtime Application Self-Protection, WebAuthn: Web Authentication API' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Appendix B: References', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Base44 Platform Documentation, React Documentation (react.dev), Ethereum Documentation (ethereum.org), OWASP Security Guidelines' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Appendix C: Revision History', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'v1.0 (2026-05-27): Initial comprehensive architecture' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Appendix D: Contact Information', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: `Prepared for: ${user.full_name || user.email}` }),
          new Paragraph({ text: 'Support: support@safedigitalwallet.com' }),
          new Paragraph({ text: 'Documentation: /docs page in application' }),
        ],
      }],
    });

    const wordBuffer = await Packer.toBuffer(wordDoc);
    const wordBlob = new Blob([wordBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const wordFileName = `SafeDigitalWallet_Architecture_${dateStr}.docx`;

    // ========== UPLOAD BOTH FILES TO GOOGLE DRIVE ==========
    const uploadFile = async (blob, fileName) => {
      const form = new FormData();
      const metadata = { name: fileName, parents: ['root'] };
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(`Google Drive upload failed: ${JSON.stringify(result)}`);
      return result;
    };

    const [pdfResult, wordResult] = await Promise.all([
      uploadFile(pdfBlob, pdfFileName),
      uploadFile(wordBlob, wordFileName),
    ]);

    return Response.json({
      success: true,
      pdf: { file_id: pdfResult.id, file_name: pdfFileName, web_view_link: pdfResult.webViewLink },
      word: { file_id: wordResult.id, file_name: wordFileName, web_view_link: wordResult.webViewLink },
      message: 'Comprehensive Solution Architecture (22 sections) generated and uploaded to Google Drive successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});