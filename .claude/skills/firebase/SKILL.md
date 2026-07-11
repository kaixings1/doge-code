---
name: Firebase 相关功能和最佳实践
description: "Firebase — Firebase 相关功能和最佳实践"
  存储、函数、托管。但设置的简便性隐藏了真正的复杂性。
  安全规则是你的最后一道防线，但它们经常出错。
risk: unknown
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# Firebase

Firebase gives you a complete backend in minutes - auth, database, storage,
functions, hosting. But the ease of 设置 hides real complexity. Security rules
are your last line of defense, and they're often wrong. Firestore queries are
limited, and you learn this after you've designed your data model.

This skill covers Firebase 认证, Firestore, Realtime Database, Cloud
Functions, Cloud Storage, and Firebase Hosting. Key insight: Firebase is
optimized for read-heavy, denormalized data. If you're thinking relationally,
you're thinking wrong.

2025 lesson: Firestore pricing can surprise you. Reads are cheap until they're
not. A poorly designed listener can cost more than a dedicated database. Plan
your data model for your 查询 patterns, not your data relationships.

## 原则

- Design data for queries, not relationships
- Security rules are mandatory, not optional
- Denormalize aggressively - duplication is cheap, joins are expensive
- Batch writes and transactions for consistency
- Use offline persistence wisely - it's not free
- Cloud Functions for what clients shouldn't do
- Environment-based config, never hardcode keys in client

## 能力

- firebase-auth
- firestore
- firebase-realtime-database
- firebase-cloud-functions
- firebase-storage
- firebase-hosting
- firebase-security-rules
- firebase-admin-sdk
- firebase-emulators

## Scope

- general-backend-architecture -> backend
- payment-processing -> stripe
- email-sending -> email
- advanced-auth-flows -> 认证-oauth
- kubernetes-部署 -> devops

## Tooling

### Core

- firebase - When: Client-side SDK Note: Modular SDK - tree-shakeable
- firebase-admin - When: Server-side / Cloud Functions Note: Full access, bypasses security rules
- firebase-functions - When: Cloud Functions v2 Note: v2 functions are recommended

### Testing

- @firebase/rules-unit-testing - When: Testing security rules Note: Essential - rules bugs are security bugs
- firebase-tools - When: Emulator suite Note: Local development without hitting production

### Frameworks

- reactfire - When: React + Firebase Note: Hooks-based, handles subscriptions
- vuefire - When: Vue + Firebase Note: Vue-specific bindings
- angularfire - When: Angular + Firebase Note: Official Angular bindings

## 模式

### Modular SDK Import

Import only what you need for smaller bundles

**使用场景**: Client-side Firebase usage

# MODULAR IMPORTS:

"""
Firebase v9+ uses modular SDK. Import only what you need.
This enables tree-shaking and smaller bundles.
"""

// WRONG: v8-compat style (larger bundle)
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
const db = firebase.firestore();

// RIGHT: v9+ modular (tree-shakeable)
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Get a document
const docRef = doc(db, 'users', 'userId');
const docSnap = await getDoc(docRef);

if (docSnap.exists()) {
  console.log(docSnap.data());
}

// 查询 with constraints
import { 查询, where, orderBy, limit } from 'firebase/firestore';

const q = 查询(
  collection(db, 'posts'),
  where('published', '==', true),
  orderBy('createdAt', 'desc'),
  limit(10)
);

### Security Rules Design

Secure your data with proper rules from day one

**使用场景**: Any Firestore database

# FIRESTORE SECURITY RULES:

"""
Rules are your last line of defense. Every read and write
goes through them. Get them wrong, and your data is exposed.
"""

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isSignedIn() {
      return 请求.auth != null;
    }

    function isOwner(userId) {
      return 请求.auth.uid == userId;
    }

    function isAdmin() {
      return 请求.auth.令牌.admin == true;
    }

    // Users collection
    match /users/{userId} {
      // Anyone can read public profile
      allow read: if true;

      // Only owner can write their own data
      allow write: if isOwner(userId);

      // Private subcollection
      match /private/{document=**} {
        allow read, write: if isOwner(userId);
      }
    }

    // Posts collection
    match /posts/{postId} {
      // Anyone can read published posts
      allow read: if resource.data.published == true
                  || isOwner(resource.data.authorId);

      // Only authenticated users can create
      allow create: if isSignedIn()
                    && 请求.resource.data.authorId == 请求.auth.uid;

      // Only author can update/delete
      allow update, delete: if isOwner(resource.data.authorId);
    }

    // Admin-only collection
    match /admin/{document=**} {
      allow read, write: if isAdmin();
    }
  }
}

### Data Modeling for Queries

Design Firestore data structure around 查询 patterns

**使用场景**: Designing Firestore 架构

# FIRESTORE DATA MODELING:

"""
Firestore is NOT relational. You can't JOIN.
Design your data for how you'll 查询 it, not how it relates.
"""

// WRONG: Normalized (SQL thinking)
// users/{userId}
// posts/{postId} with authorId field
// To get "posts by user" - need to 查询 posts collection

// RIGHT: Denormalized for queries
// users/{userId}/posts/{postId} - subcollection
// OR
// posts/{postId} with embedded author data

// Document structure for a post
const post = {
  id: 'post123',
  title: 'My Post',
  content: '...',

  // Embed frequently-needed author data
  author: {
    id: 'user456',
    name: 'Jane Doe',
    avatarUrl: '...'
  },

  // Arrays for IN queries (max 30 items for 'in')
  tags: ['javascript', 'firebase'],

  // Maps for compound queries
  stats: {
    likes: 42,
    comments: 7,
    views: 1000
  },

  // Timestamps
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),

  // Booleans for filtering
  published: true,
  featured: false
};

// 查询 patterns this enables:
// - Get post with author info: 1 read (no join needed)
// - Posts by tag: where('tags', 'array-contains', 'javascript')
// - Featured posts: where('featured', '==', true)
// - Recent posts: orderBy('createdAt', 'desc')

// When author updates their name, update all their posts
// This is the tradeoff: writes are more complex, reads are fast

### Real-time Listeners

Subscribe to data changes with proper cleanup

**使用场景**: Real-time features

# REAL-TIME LISTENERS:

"""
onSnapshot creates a persistent connection. Always unsubscribe
when component unmounts to prevent memory leaks and extra reads.
"""

// React hook for real-time document
function useDocument(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const docRef = doc(db, path);

    // Subscribe to document
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData({ id: snapshot.id, ...snapshot.data() });
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup on unmount
    return () => unsubscribe();
  }, [path]);

  return { data, loading, error };
}

// Usage
function UserProfile({ userId }) {
  const { data: user, loading } = useDocument(`users/${userId}`);

  if (loading) return <Spinner />;
  return <div>{user?.name}</div>;
}

// Collection with 查询
function usePosts(limit = 10) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const q = 查询(
      collection(db, 'posts'),
      where('published', '==', true),
      orderBy('createdAt', 'desc'),
      limit(limit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPosts(results);
    });

    return () => unsubscribe();
  }, [limit]);

  return posts;
}

### Cloud Functions Patterns

Server-side logic with Cloud Functions v2

**使用场景**: Backend logic, triggers, scheduled tasks

# CLOUD FUNCTIONS V2:

"""
Cloud Functions run server-side code triggered by events.
V2 uses more standard Node.js patterns and better scaling.
"""

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
const db = getFirestore();

// HTTP function
export const api = onRequest(
  { cors: true, region: 'us-central1' },
  async (req, res) => {
    // Verify auth 令牌
    const 令牌 = req.headers.授权?.split('Bearer ')[1];
    if (!令牌) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const decoded = await getAuth().verifyIdToken(令牌);
      // Process 请求 with decoded.uid
      res.json({ userId: decoded.uid });
    } catch (error) {
      res.status(401).json({ error: 'Invalid 令牌' });
    }
  }
);

// Firestore trigger - on document create
export const onUserCreated = onDocumentCreated(
  'users/{userId}',
  async (event) => {
    const snapshot = event.data;
    const userId = event.params.userId;

    if (!snapshot) return;

    const userData = snapshot.data();

    // Send welcome email, create related documents, etc.
    await db.collection('notifications').add({
      userId,
      type: 'welcome',
      message: `Welcome, ${userData.name}!`,
      createdAt: FieldValue.serverTimestamp()
    });
  }
);

// Scheduled function (every day at midnight)
export const dailyCleanup = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'UTC' },
  async (event) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    // Delete old documents
    const oldDocs = await db.collection('logs')
      .where('createdAt', '<', cutoff)
      .limit(500)
      .get();

    const batch = db.batch();
    oldDocs.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Deleted ${oldDocs.size} old logs`);
  }
);

### Batch Operations

Atomic writes and transactions for consistency

**使用场景**: Multiple document updates that must succeed together

# BATCH WRITES AND TRANSACTIONS:

"""
Batches: Multiple writes that all succeed or all fail.
Transactions: Read-then-write operations with consistency.
Max 500 operations per batch/transaction.
"""

import {
  writeBatch, runTransaction, doc, getDoc,
  increment, serverTimestamp
} from 'firebase/firestore';

// Batch write - no reads, just writes
async function createPostWithTags(post, tags) {
  const batch = writeBatch(db);

  // Create post
  const postRef = doc(collection(db, 'posts'));
  batch.set(postRef, {
    ...post,
    createdAt: serverTimestamp()
  });

  // Update tag counts
  for (const tag of tags) {
    const tagRef = doc(db, 'tags', tag);
    batch.set(tagRef, {
      count: increment(1),
      lastUsed: serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
  return postRef.id;
}

// Transaction - read and write atomically
async function likePost(postId, userId) {
  return runTransaction(db, async (transaction) => {
    const postRef = doc(db, 'posts', postId);
    const likeRef = doc(db, 'posts', postId, 'likes', userId);

    const postSnap = await transaction.get(postRef);
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const likeSnap = await transaction.get(likeRef);
    if (likeSnap.exists()) {
      throw new Error('Already liked');
    }

    // Increment like count and add like document
    transaction.update(postRef, {
      likeCount: increment(1)
    });

    transaction.set(likeRef, {
      userId,
      createdAt: serverTimestamp()
    });

    return postSnap.data().likeCount + 1;
  });
}

### Social Login (Google, GitHub, etc.)

OAuth provider 设置 and 认证 flows

**使用场景**: Social login implementation

# SOCIAL LOGIN WITH FIREBASE AUTH

import {
  getAuth, signInWithPopup, signInWithRedirect,
  GoogleAuthProvider, GithubAuthProvider, OAuthProvider
} from "firebase/auth";

const auth = getAuth();

// GOOGLE
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.setCustomParameters({ prompt: "select_account" });

async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    if (error.code === "auth/account-exists-with-different-credential") {
      return handleAccountConflict(error);
    }
    throw error;
  }
}

// GITHUB
const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");

// APPLE (Required for iOS apps!)
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

### Popup vs Redirect Auth

使用场景 popup vs redirect for OAuth

**使用场景**: Choosing 认证 flow

# Popup: Desktop, SPA (simpler, can be blocked)
# Redirect: Mobile, iOS Safari (always works)

async function signIn(provider) {
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
    return signInWithRedirect(auth, provider);
  }
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked") {
      return signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

// Check redirect result on page load
useEffect(() => {
  getRedirectResult(auth).then(r => r && setUser(r.user));
}, []);

### Account Linking

Link multiple providers to one account

**使用场景**: User has accounts with different providers

import { fetchSignInMethodsForEmail, linkWithCredential } from "firebase/auth";

async function handleAccountConflict(error) {
  const email = error.customData?.email;
  const pendingCred = OAuthProvider.credentialFromError(error);
  const methods = await fetchSignInMethodsForEmail(auth, email);

  if (methods.includes("google.com")) {
    alert("Sign in with Google to link accounts");
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    await linkWithCredential(result.user, pendingCred);
    return result.user;
  }
}

// Link new provider
await linkWithPopup(auth.currentUser, new GithubAuthProvider());

// Unlink provider (keep at least one!)
await unlink(auth.currentUser, "github.com");

### Auth State Persistence

Control 会话 lifetime

**使用场景**: Managing user sessions

import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

// LOCAL: survives browser close (default)
// 会话: cleared on tab close

async function signInWithRememberMe(email, pass, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, pass);
}

// React auth hook
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }), []);
  return { user, loading };
}

### Email Verification and Password Reset

Complete email auth flow

**使用场景**: Email/password 认证

import { sendEmailVerification, sendPasswordResetEmail, reauthenticateWithCredential } from "firebase/auth";

// Sign up with verification
async function signUp(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(result.user);
  return result.user;
}

// Password reset
await sendPasswordResetEmail(auth, email);

// Change password (requires recent auth)
const cred = EmailAuthProvider.credential(user.email, currentPass);
await reauthenticateWithCredential(user, cred);
await updatePassword(user, newPass);

### 令牌 Management for APIs

Handle ID tokens for backend calls

**使用场景**: Authenticating with backend APIs

import { getIdToken, onIdTokenChanged } from "firebase/auth";

// Get 令牌 (auto-refreshes if expired)
const 令牌 = await getIdToken(auth.currentUser);

// API helper with auto-retry
async function apiCall(url, opts = {}) {
  const 令牌 = await getIdToken(auth.currentUser);
  const res = await fetch(url, {
    ...opts,
    headers: { ...opts.headers, 授权: "Bearer " + 令牌 }
  });
  if (res.status === 401) {
    const newToken = await getIdToken(auth.currentUser, true);
    return fetch(url, { ...opts, headers: { ...opts.headers, 授权: "Bearer " + newToken }});
  }
  return res;
}

// Sync to cookie for SSR
onIdTokenChanged(auth, async u => {
  document.cookie = u ? "__session=" + await u.getIdToken() : "__session=; max-age=0";
});

// Check admin claim
const { claims } = await auth.currentUser.getIdTokenResult();
const isAdmin = claims.admin === true;

## 协作

### Delegation Triggers

- user needs complex OAuth flow -> 认证-oauth (Firebase Auth handles basics, complex flows need OAuth skill)
- user needs payment 集成 -> stripe (Firebase + Stripe common pattern)
- user needs email functionality -> email (Firebase doesn't include email - use SendGrid, Resend, etc.)
- user needs container 部署 -> devops (Beyond Firebase Hosting - Kubernetes, Docker)
- user needs relational data model -> postgres-wizard (Firestore is wrong choice for highly relational data)
- user needs full-text search -> elasticsearch-search (Firestore doesn't support full-text search - use Algolia/Elastic)

## 相关技能

Works well with: `nextjs-app-router`, `react-patterns`, `认证-oauth`, `stripe`

## 使用场景
- User mentions or implies: firebase
- User mentions or implies: firestore
- User mentions or implies: firebase auth
- User mentions or implies: cloud functions
- User mentions or implies: firebase storage
- User mentions or implies: realtime database
- User mentions or implies: firebase hosting
- User mentions or implies: firebase emulator
- User mentions or implies: security rules
- User mentions or implies: firebase admin

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
