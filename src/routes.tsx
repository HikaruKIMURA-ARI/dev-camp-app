import { Hono } from "hono";
import { EventNewForm, Layout } from "./views";

const routes = new Hono();

routes.get("/", (c) => c.redirect("/events/new", 302));

routes.get("/events/new", (c) =>
  c.html(
    <Layout>
      <EventNewForm />
    </Layout>,
  ),
);

export default routes;
