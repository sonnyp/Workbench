import Gio from "gi://Gio";
import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";

import Window from "./window.js";
import Actions from "./actions.js";
import { settings } from "./util.js";

const style_manager = Adw.StyleManager.get_default();

export default function Application({ version }) {
  const application = new Adw.Application({
    application_id: "re.sonny.Workbench",
    flags: Gio.ApplicationFlags.HANDLES_OPEN,
  });

  let window;

  application.connect("open", (self, files, hint) => {
    if (!window) return;

    for (const file of files) {
      window.openFile(file).catch(logError);
    }
  });

  application.connect("activate", () => {
    window =
      window ||
      Window({
        application,
      });
    window.window.present();
  });

  application.connect("startup", () => {
    const provider = new Gtk.CssProvider();
    provider.load_from_resource("/re/sonny/Workbench/style.css");
    Gtk.StyleContext.add_provider_for_display(
      Gdk.Display.get_default(),
      provider,
      Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
  });

  application.set_option_context_description("<https://workbench.sonny.re>");
  application.set_option_context_parameter_string("[files…]");
  // TODO: Add examples
  // application.set_option_context_summary("");

  Actions({ application, version });

  import("./overrides.js").catch(logError);

  return application;
}

function setColorScheme() {
  const color_scheme = settings.get_int("color-scheme");
  style_manager.set_color_scheme(color_scheme);
}
setColorScheme();
settings.connect("changed::color-scheme", setColorScheme);
