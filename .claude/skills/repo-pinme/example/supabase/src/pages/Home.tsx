import { useState, useEffect } from "react";
import TodoList from "../components/TodoList";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import "./Home.css";

const Home = (): JSX.Element => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      console.log(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="home-container">
      <div className="home-card">
        <div className="home-content">
          <div className="home-header">
            <h1 className="home-title">Task List App</h1>
            <p className="home-subtitle">Manage your daily tasks</p>
          </div>

          {!session ? (
            <div className="auth-container">
              <Auth
                supabaseClient={supabase}
                appearance={{
                  theme: ThemeSupa,
                  variables: {
                    default: {
                      colors: {
                        brand: "#4F46E5",
                        brandAccent: "#4338CA",
                      },
                    },
                  },
                }}
              />
            </div>
          ) : (
            <TodoList session={session} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
