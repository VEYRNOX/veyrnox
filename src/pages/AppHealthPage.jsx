import { useNavigate } from 'react-router-dom';
import AppHealthWidget from '@/components/AppHealthWidget';

export default function AppHealthPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded text-muted-foreground hover:text-foreground"
          aria-label="Go back"
        >
          <i className="ti ti-chevron-left text-xl" aria-hidden="true" />
        </button>
        <h1 className="text-lg font-medium">App health</h1>
      </div>
      <AppHealthWidget />
    </div>
  );
}
