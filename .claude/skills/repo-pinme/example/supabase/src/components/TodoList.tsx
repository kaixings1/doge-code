import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import "./TodoList.css";

interface ITodo {
  id: number;
  task: string;
  is_complete: boolean;
  user_id: string;
}

export default function TodoList({ session }: { session: Session }) {
  const [todos, setTodos] = useState<ITodo[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [errorText, setErrorText] = useState("");

  const user = session.user;

  useEffect(() => {
    const fetchTodos = async () => {
      const { data: todos, error } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", user.id)
        .order("id", { ascending: true });

      if (error) console.log("error", error);
      else setTodos(todos);
    };

    fetchTodos();
  }, []);

  const addTodo = async (taskText: string) => {
    let task = taskText.trim();
    if (task.length) {
      const { data: todo, error } = await supabase
        .from("todos")
        .insert({ task, user_id: user.id, is_complete: false })
        .select()
        .single();

      if (error) {
        setErrorText(error.message);
      } else {
        setTodos([...todos, todo]);
        setNewTaskText("");
      }
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      await supabase.from("todos").delete().eq("id", id).throwOnError();
      setTodos(todos.filter((x) => x.id != id));
    } catch (error) {
      console.log("error", error);
    }
  };

  return (
    <div className="todo-container">
      <div className="todo-header">
        <h1 className="todo-title">My Tasks</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="btn btn-secondary"
        >
          Sign Out
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTodo(newTaskText);
        }}
        className="todo-form"
      >
        <input
          className="todo-input"
          type="text"
          placeholder="Add new task..."
          value={newTaskText}
          onChange={(e) => {
            setErrorText("");
            setNewTaskText(e.target.value);
          }}
        />
        <button className="btn btn-primary" type="submit">
          Add
        </button>
      </form>

      {!!errorText && <Alert text={errorText} />}

      {todos.length === 0 ? (
        <div className="todo-empty">
          <p>No tasks yet. Add a new task to get started.</p>
        </div>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <Todo
              key={todo.id}
              todo={todo}
              onDelete={() => deleteTodo(todo.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const Todo = ({ todo, onDelete }: { todo: ITodo; onDelete: () => void }) => {
  const [isCompleted, setIsCompleted] = useState(todo.is_complete);

  const toggle = async () => {
    try {
      const { data } = await supabase
        .from("todos")
        .update({ is_complete: !isCompleted })
        .eq("id", todo.id)
        .throwOnError()
        .select()
        .single();

      if (data) setIsCompleted(data.is_complete);
    } catch (error) {
      console.log("error", error);
    }
  };

  return (
    <li className={`todo-item ${isCompleted ? "completed" : ""}`}>
      <input
        className="todo-checkbox"
        onChange={() => toggle()}
        type="checkbox"
        checked={isCompleted}
      />
      <p className={`todo-text ${isCompleted ? "completed" : ""}`}>
        {todo.task}
      </p>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="todo-delete"
        title="Delete task"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </li>
  );
};

const Alert = ({ text }: { text: string }) => (
  <div className="alert alert-error">
    <div className="alert-icon">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="#b91c1c">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    </div>
    <div className="alert-message">{text}</div>
  </div>
);
