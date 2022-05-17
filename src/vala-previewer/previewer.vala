namespace Workbench {

  [DBus (name="re.sonny.Workbench.vala_previewer")]
  public class Previewer : Object {

    construct {
      this.window = new Gtk.Window () {
        hide_on_close = true,
        default_width = 600,
        default_height = 800
      };
      this.window.close_request.connect (() => { this.window_open (false); });
      this.notify["dark-mode"].connect (() => {
        if (this.dark_mode)
          this.color_scheme.color_scheme = Adw.ColorScheme.FORCE_DARK;
        else
          this.color_scheme.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
      });
    }

    public void update_ui (string content, string target_id) {
      this.builder = new Gtk.Builder.from_string (content, content.length);
      var target = this.builder.get_object (target_id) as Gtk.Widget;
      if (target == null) {
        stderr.printf (@"Widget with target_id='$target_id' could not be found.\n");
          return;
      }
      if (target is Gtk.Root) {
        if (!(this.window.get_type () == target.get_type ())) {
          this.window.destroy ();
          this.window = target as Gtk.Window;
          this.window.close_request.connect (() => { this.window_open (false); return false; });
        } else if (target is Adw.Window) {
          var child = ((Adw.Window) target).content;
          ((Adw.Window) target).content = null;
          ((Adw.Window) this.window).content = child;
        } else if (target is Adw.ApplicationWindow) {
          var child = ((Adw.ApplicationWindow) target).content;
          ((Adw.ApplicationWindow) target).content = null;
          ((Adw.ApplicationWindow) this.window).content = child;
        } else if (target is Gtk.Window) {
          var child = ((Gtk.Window) target).child;
          ((Gtk.Window) target).child = null;
          this.window.child = child;
        }
      } else {
        this.window.child = target;
      }
    }

    public void update_css (string content) {
      if (this.css != null)
        Gtk.StyleContext.remove_provider_for_display (Gdk.Display.get_default (), this.css);
      this.css = new Gtk.CssProvider ();
      this.css.load_from_data (content.data);
      Gtk.StyleContext.add_provider_for_display (Gdk.Display.get_default (), this.css , Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    // filename to loadable module or empty string ("") to just run it again
    // also builder_symbol can be empty. Then the builder object is not handed over to the module
    public void run (string filename, string run_symbol, string builder_symbol, string window_symbol) {
      if (filename == "") {
        if (this.module == null) {
          stderr.printf ("No Module specified yet.\n");
          return;
        }
      } else {
        if (!Module.supported ()) {
          stderr.printf ("This system does not support loadable modules.\n");
          return;
        }

        if (this.module != null)
          this.module.close ();
        this.module = Module.open (filename, ModuleFlags.LAZY);
        if (this.module == null) {
          stderr.printf ("Module loading failed.\n");
          return;
        }
      }

      if (builder_symbol != "") {
        if (this.builder == null) {
          stderr.printf ("No UI definition loaded yet.\n");
          return;
        }

        this.window.present ();
        this.window_open (true);

        void* function;
        this.module.symbol (builder_symbol, out function);
        if (function == null) {
          stderr.printf (@"Module does not contain symbol '$builder_symbol'.\n");
          return;
        }

        var set_builder = (BuilderFunction) function;
        set_builder (this.builder);

        this.module.symbol (window_symbol, out function);
        if (function == null) {
          stderr.printf (@"Module does not contain symbol '$window_symbol'.\n");
          return;
        }

        var set_window = (WindowFunction) function;
        set_window (this.window);
      }

      void* function;
      this.module.symbol (run_symbol, out function);
      if (function == null) {
        stderr.printf (@"Function '$run_symbol' not found.\n");
        return;
      }

      var run = (RunFunction) function;
      run ();
    }

    public void close_window () {
      this.window.close ();
    }

    public bool dark_mode { get; set; default = false; }

    public signal void window_open (bool open);

    [CCode (has_target=false)]
    private delegate void RunFunction ();

    [CCode (has_target=false)]
    private delegate void BuilderFunction (Gtk.Builder builder);

    [CCode (has_target=false)]
    private delegate void WindowFunction (Gtk.Window window);

    private Gtk.Window window;
    private Gtk.CssProvider? css = null;
    private Module module;
    private Gtk.Builder? builder = null;
    private Adw.StyleManager color_scheme = Adw.StyleManager.get_default ();
  }

  async void main (string[] args) {
    Gtk.init ();
    Adw.init ();

    Bus.own_name (BusType.SESSION,
                  "re.sonny.Workbench.vala_previewer",
                  BusNameOwnerFlags.NONE,
                  null,
                  (connection, name) => {
                    try {
                      connection.register_object ("/re/sonny/workbench/vala_previewer", new Previewer ());
                    } catch (IOError e) {
                      stderr.printf ("Could not register service\n");
                    }
                  },
                  (connection, name) => { stderr.printf ("Couldn't obtain the bus name.\n"); });

    yield;
  }
}
