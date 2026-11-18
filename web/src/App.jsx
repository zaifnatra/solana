import './App.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import MyTokensPage from './pages/MyTokensPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/my-tokens" element={<MyTokensPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
