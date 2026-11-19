"""turtle for codeshare: the same API as Python's turtle module, drawn on a canvas in the page.

Python computes every position (with the same maths as CPython's turtle), and sends drawing
steps to the page, which animates them at CPython's speeds. Desktop-only parts (keyboard and
mouse events, background images) are accepted but do nothing, with a one-time note.
"""

import json
import math
import sys

from js import turtleNote, turtleSend, turtleWait

try:
    from pyodide.ffi import can_run_sync, run_sync
    _CAN_WAIT = can_run_sync()
except Exception:  # older Pyodide or no JSPI
    _CAN_WAIT = False

__all__ = [
    "ScrolledCanvas", "TurtleScreen", "Screen", "RawTurtle", "Turtle", "RawPen", "Pen", "Shape", "Vec2D",
    "addshape", "bgcolor", "bgpic", "bye", "clearscreen", "colormode", "delay", "exitonclick", "getcanvas",
    "getshapes", "listen", "mainloop", "mode", "numinput", "onkey", "onkeypress", "onkeyrelease",
    "onscreenclick", "ontimer", "register_shape", "resetscreen", "screensize", "setup", "setworldcoordinates",
    "textinput", "title", "tracer", "turtles", "update", "window_height", "window_width",
    "back", "backward", "begin_fill", "begin_poly", "bk", "circle", "clear", "clearstamp", "clearstamps",
    "clone", "color", "degrees", "distance", "dot", "down", "end_fill", "end_poly", "fd", "fillcolor",
    "filling", "forward", "get_poly", "getpen", "getscreen", "get_shapepoly", "getturtle", "goto", "heading",
    "hideturtle", "home", "ht", "isdown", "isvisible", "left", "lt", "onclick", "ondrag", "onrelease", "pd",
    "pen", "pencolor", "pendown", "pensize", "penup", "pos", "position", "pu", "radians", "right", "reset",
    "resizemode", "rt", "seth", "setheading", "setpos", "setposition", "settiltangle", "setundobuffer",
    "setx", "sety", "shape", "shapesize", "shapetransform", "shearfactor", "showturtle", "speed", "st",
    "stamp", "teleport", "tilt", "tiltangle", "towards", "turtlesize", "undo", "undobufferentries", "up",
    "width", "write", "xcor", "ycor", "done", "Terminator",
]


class Terminator(Exception):
    """Raised by CPython when the window is closed. Kept so `except turtle.Terminator` works."""


class TurtleGraphicsError(Exception):
    pass


class Vec2D(tuple):
    """A 2D vector, as returned by position(). Prints like (100.00,0.00)."""

    def __new__(cls, x, y):
        return tuple.__new__(cls, (x, y))

    def __add__(self, other):
        return Vec2D(self[0] + other[0], self[1] + other[1])

    def __mul__(self, other):
        if isinstance(other, Vec2D):
            return self[0] * other[0] + self[1] * other[1]
        return Vec2D(self[0] * other, self[1] * other)

    def __rmul__(self, other):
        if isinstance(other, (int, float)):
            return Vec2D(self[0] * other, self[1] * other)
        return NotImplemented

    def __sub__(self, other):
        return Vec2D(self[0] - other[0], self[1] - other[1])

    def __neg__(self):
        return Vec2D(-self[0], -self[1])

    def __abs__(self):
        return math.hypot(*self)

    def rotate(self, angle):
        perp = Vec2D(-self[1], self[0])
        angle = math.radians(angle)
        c, s = math.cos(angle), math.sin(angle)
        return Vec2D(self[0] * c + perp[0] * s, self[1] * c + perp[1] * s)

    def __getnewargs__(self):
        return (self[0], self[1])

    def __repr__(self):
        return "(%.2f,%.2f)" % self


# ---- sending drawing steps to the page ----

_ops = []
_sent = 0


def _send(op):
    global _sent
    _ops.append(op)
    if len(_ops) >= 200:
        _flush()
        _sent += 200
        # Don't let a fast loop race far ahead of the drawing (or an endless loop fill memory).
        if _sent >= 1000:
            _sent = 0
            _wait(300)


def _flush():
    if _ops:
        turtleSend(json.dumps(_ops))
        _ops.clear()


def _wait(pending):
    """Pause until the page has at most `pending` steps left to draw (Chrome and Edge only)."""
    _flush()
    if _CAN_WAIT:
        run_sync(turtleWait(pending))


_noted = set()


def _note(what):
    if what not in _noted:
        _noted.add(what)
        turtleNote(what)


# ---- colours ----

def _css(color, mode):
    """A Tk-style colour (name, #hex or (r, g, b) tuple) as a CSS colour."""
    if isinstance(color, str):
        if color.startswith("#"):
            if len(color) in (4, 7) and all(ch in "0123456789abcdefABCDEF" for ch in color[1:]):
                return color
            if len(color) == 13:  # Tk's #rrrrggggbbbb
                return "#" + color[1:3] + color[5:7] + color[9:11]
            raise TurtleGraphicsError("bad color string: %s" % color)
        return color.replace(" ", "").lower()
    try:
        r, g, b = color
    except (TypeError, ValueError):
        raise TurtleGraphicsError("bad color arguments: %s" % str(color))
    if mode == 1.0:
        r, g, b = [round(255.0 * x) for x in (r, g, b)]
    if not all(isinstance(x, (int, float)) and 0 <= x <= 255 for x in (r, g, b)):
        raise TurtleGraphicsError("bad color sequence: %s" % str(color))
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def _colorarg(args):
    if len(args) == 1:
        return args[0]
    if len(args) == 3:
        return tuple(args)
    raise TurtleGraphicsError("bad color arguments: %s" % str(args))


_SPEEDS = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}

_SHAPES = {
    "arrow": [(-10, 0), (10, 0), (0, 10)],
    "turtle": [(0, 16), (-2, 14), (-1, 10), (-4, 7), (-7, 9), (-9, 8), (-6, 5), (-7, 1), (-5, -3), (-8, -6),
               (-6, -8), (-4, -5), (0, -7), (4, -5), (6, -8), (8, -6), (5, -3), (7, 1), (6, 5), (9, 8), (7, 9),
               (4, 7), (1, 10), (2, 14)],
    "circle": [(10, 0), (9.51, 3.09), (8.09, 5.88), (5.88, 8.09), (3.09, 9.51), (0, 10), (-3.09, 9.51),
               (-5.88, 8.09), (-8.09, 5.88), (-9.51, 3.09), (-10, 0), (-9.51, -3.09), (-8.09, -5.88),
               (-5.88, -8.09), (-3.09, -9.51), (0, -10), (3.09, -9.51), (5.88, -8.09), (8.09, -5.88),
               (9.51, -3.09)],
    "square": [(10, -10), (10, 10), (-10, 10), (-10, -10)],
    "triangle": [(10, -5.77), (0, 11.55), (-10, -5.77)],
    "classic": [(0, 0), (-5, -9), (0, -7), (5, -9)],
    "blank": [],
}


class Shape:
    """Only polygon shapes are supported here."""

    def __init__(self, type_, data=None):
        if type_ != "polygon":
            raise TurtleGraphicsError("only polygon shapes are supported in the browser")
        self._type = type_
        self._data = [tuple(p) for p in (data or [])]


# ---- the screen ----

class TurtleScreen:
    _instance = None

    def __init__(self):
        self._bg = "white"
        self._colormode = 1.0
        self._tracing = 1
        self._mode = "standard"
        self._width = 800
        self._height = 600
        self._turtles = []
        self._shapes = dict(_SHAPES)
        self._title = "Python Turtle Graphics"

    # appearance
    def bgcolor(self, *args):
        if not args:
            return self._bg
        self._bg = _colorarg(args)
        _send({"o": "bg", "c": _css(self._bg, self._colormode)})

    def title(self, titlestring):
        self._title = str(titlestring)
        _send({"o": "title", "t": self._title})

    def setup(self, width=0.5, height=0.75, startx=None, starty=None):
        # Fractions are of a typical laptop screen, as on the desktop.
        if isinstance(width, float) and 0 <= width <= 1:
            width = int(1600 * width)
        if isinstance(height, float) and 0 <= height <= 1:
            height = int(800 * height)
        self._width, self._height = int(width), int(height)
        _send({"o": "size", "w": self._width, "h": self._height})

    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if canvwidth is None and canvheight is None and bg is None:
            return self._width, self._height
        if bg is not None:
            self.bgcolor(bg)

    def window_width(self):
        return self._width

    def window_height(self):
        return self._height

    def colormode(self, cmode=None):
        if cmode is None:
            return self._colormode
        if cmode == 1.0:
            self._colormode = float(cmode)
        elif cmode == 255:
            self._colormode = int(cmode)

    def mode(self, mode=None):
        if mode is None:
            return self._mode
        mode = mode.lower()
        if mode not in ("standard", "logo", "world"):
            raise TurtleGraphicsError("No turtle-graphics-mode %s" % mode)
        if mode == "world":
            _note("setworldcoordinates() isn't supported in the browser yet; using standard mode.")
            mode = "standard"
        self._mode = mode
        self.reset()

    def setworldcoordinates(self, llx, lly, urx, ury):
        _note("setworldcoordinates() isn't supported in the browser yet; using standard mode.")

    # animation
    def tracer(self, n=None, delay=None):
        if n is None:
            return self._tracing
        self._tracing = int(n)

    def delay(self, delay=None):
        return 10 if delay is None else None

    def update(self):
        _flush()

    # turtles
    def turtles(self):
        return list(self._turtles)

    def clear(self):
        """Delete all drawings and all turtles; the screen goes back to white."""
        self._turtles = []
        self._bg = "white"
        self._tracing = 1
        _send({"o": "clearscreen"})

    clearscreen = clear

    def reset(self):
        for t in self._turtles:
            t.reset()

    resetscreen = reset

    def register_shape(self, name, shape=None):
        if shape is None:
            if str(name).lower().endswith(".gif"):
                _note("Image shapes (.gif) aren't supported in the browser.")
                return
            raise TurtleGraphicsError("shape must be a polygon")
        if isinstance(shape, Shape):
            shape = shape._data
        self._shapes[name] = [tuple(p) for p in shape]

    addshape = register_shape

    def getshapes(self):
        return sorted(self._shapes)

    def bgpic(self, picname=None):
        _note("Background pictures (bgpic) aren't supported in the browser.")
        return "nopic"

    # input
    def textinput(self, title, prompt):
        _wait(0)
        try:
            return input(str(prompt) + " ")
        except EOFError:
            return None

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        while True:
            text = self.textinput(title, prompt)
            if text is None:
                return None
            if text.strip() == "" and default is not None:
                return float(default)
            try:
                value = float(text)
            except ValueError:
                print("Please type a number.")
                continue
            if minval is not None and value < minval:
                print("The number must be at least %s." % minval)
                continue
            if maxval is not None and value > maxval:
                print("The number must be at most %s." % maxval)
                continue
            return value

    # keyboard, mouse and timers: not available here
    def _events(self, *args, **kwargs):
        _note("Keyboard, mouse and timer events (onkey, onclick, ontimer, listen) don't work in the browser yet, so they're skipped.")

    listen = onkey = onkeypress = onkeyrelease = onclick = onscreenclick = ontimer = _events

    # the end of a program
    def mainloop(self):
        _flush()

    done = mainloop

    def exitonclick(self):
        _flush()

    def bye(self):
        _flush()

    def getcanvas(self):
        raise TurtleGraphicsError("getcanvas() isn't available in the browser")


_Screen = TurtleScreen
ScrolledCanvas = TurtleScreen


def Screen():
    if TurtleScreen._instance is None:
        TurtleScreen._instance = TurtleScreen()
    return TurtleScreen._instance


# ---- turtles ----

_next_id = 0
_next_stamp = 0


def _clean(v):
    """Snap values within float noise of a whole number, so a square ends exactly where it began."""
    r = round(v)
    return float(r) if abs(v - r) < 1e-9 else v


class RawTurtle:
    def __init__(self, canvas=None, shape="classic", undobuffersize=1000, visible=True):
        global _next_id
        _next_id += 1
        self._id = _next_id
        self.screen = Screen()
        self.screen._turtles.append(self)
        self._shape = shape
        self._visible = visible
        self._stamps = []
        self._init_state()
        _send({"o": "new", "id": self._id})
        self._sync()

    def _init_state(self):
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0  # always in standard degrees: 0 = east, counterclockwise
        self._down = True
        self._pencolor = "black"
        self._fillcolor = "black"
        self._pensize = 1
        self._speed = 3
        self._fullcircle = 360.0
        self._filling = False
        self._fillpath = []
        self._poly = None
        self._stretch = (1.0, 1.0)
        self._outline = 1

    def _sync(self):
        """Send everything about how this turtle looks."""
        _send({
            "o": "set", "id": self._id, "x": self._x, "y": self._y, "h": self._heading,
            "vis": self._visible, "poly": self.screen._shapes.get(self._shape, []),
            "pc": _css(self._pencolor, self.screen._colormode), "fc": _css(self._fillcolor, self.screen._colormode),
            "sw": self._stretch[0], "sl": self._stretch[1], "ow": self._outline,
        })

    def _anim(self):
        return self._speed if self.screen._tracing == 1 else 0

    # -- movement --
    def _goto(self, x, y, draw=None, fill=True):
        x, y = _clean(x), _clean(y)
        down = self._down if draw is None else draw
        _send({"o": "go", "id": self._id, "x": x, "y": y, "d": down,
               "c": _css(self._pencolor, self.screen._colormode), "w": self._pensize, "s": self._anim()})
        self._x, self._y = x, y
        if self._filling and fill:
            self._fillpath.append((x, y))
        if self._poly is not None:
            self._poly.append(Vec2D(x, y))

    def forward(self, distance):
        rad = math.radians(self._heading)
        self._goto(self._x + distance * math.cos(rad), self._y + distance * math.sin(rad))

    fd = forward

    def back(self, distance):
        self.forward(-distance)

    bk = backward = back

    def _turn(self, degrees):
        self._heading = _clean((self._heading + degrees) % 360.0)
        _send({"o": "turn", "id": self._id, "h": self._heading, "s": self._anim() if self._visible else 0})

    def _deg(self, angle):
        return angle * 360.0 / self._fullcircle

    def left(self, angle):
        self._turn(self._deg(angle))

    lt = left

    def right(self, angle):
        self._turn(-self._deg(angle))

    rt = right

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._goto(x, y)

    setpos = setposition = goto

    def teleport(self, x=None, y=None, *, fill_gap=False):
        self._goto(self._x if x is None else x, self._y if y is None else y, draw=False, fill=fill_gap)

    def setx(self, x):
        self._goto(x, self._y)

    def sety(self, y):
        self._goto(self._x, y)

    def home(self):
        self._goto(0, 0)
        self.setheading(0)

    def setheading(self, to_angle):
        angle = self._deg(to_angle)
        if self.screen._mode == "logo":
            angle = 90.0 - angle
        target = angle % 360.0
        diff = (target - self._heading + 180.0) % 360.0 - 180.0
        self._turn(diff)

    seth = setheading

    def circle(self, radius, extent=None, steps=None):
        if extent is None:
            extent = self._fullcircle
        extent = self._deg(extent)
        if steps is None:
            frac = abs(extent) / 360.0
            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        w = 1.0 * extent / steps
        w2 = 0.5 * w
        length = 2.0 * radius * math.sin(math.radians(w2))
        if radius < 0:
            length, w, w2 = -length, -w, -w2
        self._turn(w2)
        for _ in range(steps):
            rad = math.radians(self._heading)
            self._goto(self._x + length * math.cos(rad), self._y + length * math.sin(rad))
            self._turn(w)
        self._turn(-w2)

    # -- where am I --
    def position(self):
        return Vec2D(self._x, self._y)

    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        h = self._heading
        if self.screen._mode == "logo":
            h = (90.0 - h) % 360.0
        return _clean(h * self._fullcircle / 360.0) % self._fullcircle

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        angle = math.degrees(math.atan2(y - self._y, x - self._x)) % 360.0
        if self.screen._mode == "logo":
            angle = (90.0 - angle) % 360.0
        return _clean(angle * self._fullcircle / 360.0) % self._fullcircle

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(x - self._x, y - self._y)

    def degrees(self, fullcircle=360.0):
        self._fullcircle = fullcircle

    def radians(self):
        self._fullcircle = 2 * math.pi

    # -- pen --
    def penup(self):
        self._down = False

    pu = up = penup

    def pendown(self):
        self._down = True

    pd = down = pendown

    def isdown(self):
        return self._down

    def pensize(self, width=None):
        if width is None:
            return self._pensize
        self._pensize = width

    width = pensize

    def speed(self, speed=None):
        if speed is None:
            return self._speed
        if speed in _SPEEDS:
            speed = _SPEEDS[speed]
        elif 0.5 < speed < 10.5:
            speed = int(round(speed))
        else:
            speed = 0
        self._speed = speed

    def pencolor(self, *args):
        if not args:
            return self._pencolor
        color = _colorarg(args)
        _css(color, self.screen._colormode)
        self._pencolor = color
        self._sync()

    def fillcolor(self, *args):
        if not args:
            return self._fillcolor
        color = _colorarg(args)
        _css(color, self.screen._colormode)
        self._fillcolor = color
        self._sync()

    def color(self, *args):
        if not args:
            return self._pencolor, self._fillcolor
        if len(args) == 1:
            pen = fill = args[0]
        elif len(args) == 2:
            pen, fill = args
        elif len(args) == 3:
            pen = fill = tuple(args)
        else:
            raise TurtleGraphicsError("bad color arguments: %s" % str(args))
        _css(pen, self.screen._colormode)
        _css(fill, self.screen._colormode)
        self._pencolor, self._fillcolor = pen, fill
        self._sync()

    def pen(self, pen=None, **pendict):
        current = {
            "shown": self._visible, "pendown": self._down, "pencolor": self._pencolor,
            "fillcolor": self._fillcolor, "pensize": self._pensize, "speed": self._speed,
            "resizemode": "noresize", "stretchfactor": self._stretch, "outline": self._outline, "tilt": 0.0,
        }
        if pen is None and not pendict:
            return current
        settings = dict(pen or {})
        settings.update(pendict)
        if "shown" in settings:
            self._visible = bool(settings["shown"])
        if "pendown" in settings:
            self._down = bool(settings["pendown"])
        if "pencolor" in settings:
            self._pencolor = settings["pencolor"]
        if "fillcolor" in settings:
            self._fillcolor = settings["fillcolor"]
        if "pensize" in settings:
            self._pensize = settings["pensize"]
        if "speed" in settings:
            self.speed(settings["speed"])
        if "stretchfactor" in settings:
            self._stretch = tuple(settings["stretchfactor"])
        if "outline" in settings:
            self._outline = settings["outline"]
        self._sync()

    # -- filling --
    def filling(self):
        return self._filling

    def begin_fill(self):
        self._filling = True
        self._fillpath = [(self._x, self._y)]
        _send({"o": "fillstart", "id": self._id})

    def end_fill(self):
        if self._filling and len(self._fillpath) > 2:
            _send({"o": "fill", "id": self._id, "pts": self._fillpath,
                   "c": _css(self._fillcolor, self.screen._colormode)})
        self._filling = False
        self._fillpath = []

    def begin_poly(self):
        self._poly = [Vec2D(self._x, self._y)]

    def end_poly(self):
        self._polydone = tuple(self._poly or ())
        self._poly = None

    def get_poly(self):
        return getattr(self, "_polydone", None)

    # -- drawing extras --
    def dot(self, size=None, *color):
        if size is not None and not isinstance(size, (int, float)):
            color = (size,) + color
            size = None
        if size is None:
            size = max(self._pensize + 4, 2 * self._pensize)
        c = _css(_colorarg(color), self.screen._colormode) if color else _css(self._pencolor, self.screen._colormode)
        _send({"o": "dot", "id": self._id, "x": self._x, "y": self._y, "r": size / 2.0, "c": c})

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        family, size = font[0], font[1]
        style = font[2] if len(font) > 2 else "normal"
        text = str(arg)
        _send({"o": "text", "id": self._id, "x": self._x, "y": self._y, "t": text, "a": align,
               "f": [family, size, style], "c": _css(self._pencolor, self.screen._colormode)})
        if move:
            # About the width the text takes up (the browser measures it exactly when drawing).
            self._goto(self._x + len(text) * size * 0.6, self._y, draw=False)

    def stamp(self):
        global _next_stamp
        _next_stamp += 1
        self._stamps.append(_next_stamp)
        _send({"o": "stamp", "id": self._id, "sid": _next_stamp})
        return _next_stamp

    def clearstamp(self, stampid):
        if stampid in self._stamps:
            self._stamps.remove(stampid)
            _send({"o": "clearstamp", "sid": stampid})

    def clearstamps(self, n=None):
        if n is None:
            chosen = list(self._stamps)
        elif n >= 0:
            chosen = self._stamps[:n]
        else:
            chosen = self._stamps[n:]
        for sid in chosen:
            self.clearstamp(sid)

    def clear(self):
        _send({"o": "clear", "id": self._id})

    def reset(self):
        self._init_state()
        self._stamps = []
        self._visible = True
        self._shape = "classic"
        _send({"o": "clear", "id": self._id})
        self._sync()

    # -- looks --
    def showturtle(self):
        self._visible = True
        self._sync()

    st = showturtle

    def hideturtle(self):
        self._visible = False
        self._sync()

    ht = hideturtle

    def isvisible(self):
        return self._visible

    def shape(self, name=None):
        if name is None:
            return self._shape
        if name not in self.screen._shapes:
            raise TurtleGraphicsError("There is no shape named %s" % name)
        self._shape = name
        self._sync()

    def shapesize(self, stretch_wid=None, stretch_len=None, outline=None):
        if stretch_wid is None and stretch_len is None and outline is None:
            return self._stretch[0], self._stretch[1], self._outline
        if stretch_wid is not None and stretch_len is None:
            stretch_len = stretch_wid
        wid = self._stretch[0] if stretch_wid is None else stretch_wid
        ln = self._stretch[1] if stretch_len is None else stretch_len
        self._stretch = (wid, ln)
        if outline is not None:
            self._outline = outline
        self._sync()

    turtlesize = shapesize

    def resizemode(self, rmode=None):
        return "noresize" if rmode is None else None

    def get_shapepoly(self):
        return tuple(self.screen._shapes.get(self._shape, []))

    def _unsupported(self, *args, **kwargs):
        _note("tilt, shear and shape transforms aren't supported in the browser yet, so they're skipped.")

    tilt = settiltangle = tiltangle = shearfactor = shapetransform = _unsupported

    def undo(self):
        _note("undo() isn't supported in the browser yet.")

    def setundobuffer(self, size):
        pass

    def undobufferentries(self):
        return 0

    # -- events (not here) --
    def onclick(self, fun, btn=1, add=None):
        self.screen._events()

    onrelease = ondrag = onclick

    # -- others --
    def clone(self):
        q = Turtle(shape=self._shape, visible=self._visible)
        for key in ("_x", "_y", "_heading", "_down", "_pencolor", "_fillcolor", "_pensize", "_speed",
                    "_fullcircle", "_stretch", "_outline"):
            setattr(q, key, getattr(self, key))
        q._sync()
        return q

    def getscreen(self):
        return self.screen

    def getturtle(self):
        return self

    getpen = getturtle

    def __repr__(self):
        return "<turtle.Turtle object>"


class Turtle(RawTurtle):
    _pen = None

    def __init__(self, shape="classic", undobuffersize=1000, visible=True):
        super().__init__(None, shape=shape, undobuffersize=undobuffersize, visible=visible)


RawPen = RawTurtle
Pen = Turtle


def getturtle():
    if Turtle._pen is None or Turtle._pen not in Screen()._turtles:
        Turtle._pen = Turtle()
    return Turtle._pen


getpen = getturtle


# ---- module-level functions, like CPython's ----

def _screen_function(name):
    def fn(*args, **kwargs):
        return getattr(Screen(), name)(*args, **kwargs)
    fn.__name__ = name
    return fn


def _turtle_function(name):
    def fn(*args, **kwargs):
        return getattr(getturtle(), name)(*args, **kwargs)
    fn.__name__ = name
    return fn


for _name in ("addshape", "bgcolor", "bgpic", "bye", "clearscreen", "colormode", "delay", "exitonclick",
              "getcanvas", "getshapes", "listen", "mainloop", "mode", "numinput", "onkey", "onkeypress",
              "onkeyrelease", "onscreenclick", "ontimer", "register_shape", "resetscreen", "screensize", "setup",
              "setworldcoordinates", "textinput", "title", "tracer", "turtles", "update", "window_height",
              "window_width", "done"):
    globals()[_name] = _screen_function(_name)

for _name in __all__:
    if _name not in globals() and hasattr(RawTurtle, _name):
        globals()[_name] = _turtle_function(_name)

del _name
