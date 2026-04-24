import { initializeApp } from 'firebase/app'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyAesIJajTGwn4YEvw-nScPPRPiYAUuscAw',
  authDomain: 'kkmonth.firebaseapp.com',
  projectId: 'kkmonth',
  storageBucket: 'kkmonth.firebasestorage.app',
  messagingSenderId: '710796627823',
  appId: '1:710796627823:web:87b7f7d165ad9ecd6ba29a'
}

const app = initializeApp(firebaseConfig)
export const storage = getStorage(app)
