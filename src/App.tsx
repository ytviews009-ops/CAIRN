import { useApp } from '@/context/AppContext';
import { HomeScreen } from '@/screens/HomeScreen';
import { IncidentScreen } from '@/screens/IncidentScreen';
import { OfflineScreen } from '@/screens/OfflineScreen';
import { RelayScreen } from '@/screens/RelayScreen';
import { ReconnectScreen } from '@/screens/ReconnectScreen';
import { ConflictsScreen } from '@/screens/ConflictsScreen';

function App() {
  const { screen } = useApp();

  switch (screen) {
    case 'home':
      return <HomeScreen />;
    case 'incident':
      return <IncidentScreen />;
    case 'offline':
      return <OfflineScreen />;
    case 'relay':
      return <RelayScreen />;
    case 'reconnect':
      return <ReconnectScreen />;
    case 'conflicts':
      return <ConflictsScreen />;
    default:
      return <HomeScreen />;
  }
}

export default App;
