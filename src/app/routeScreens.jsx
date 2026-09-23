import { useParams } from "react-router";
import ChatPage from "../components/ChatPage.jsx";
import MyPage from "../components/MyPage.jsx";
import NotFound from "../components/NotFound.jsx";
import { MY_TABS, parseId } from "../routes.js";

/** 경로의 id 가 올바를 때만 화면을 그린다. /products/abc 같은 주소는 없는 페이지다. */
export function RequireId({ name, onHome, children }) {
  const params = useParams();
  return parseId(params[name]) ? children : <NotFound onHome={onHome} />;
}

export function ChatScreen(props) {
  const { roomId } = useParams();
  if (roomId !== undefined && !parseId(roomId)) return <NotFound onHome={props.onHome} />;
  return <ChatPage key={props.user?.id ?? "guest"} {...props} roomId={parseId(roomId)} />;
}

export function MyScreen(props) {
  const { tab = "favorites" } = useParams();
  if (!MY_TABS.includes(tab)) return <NotFound onHome={props.onHome} />;
  return <MyPage key={props.user?.id ?? "guest"} {...props} tab={tab} />;
}
