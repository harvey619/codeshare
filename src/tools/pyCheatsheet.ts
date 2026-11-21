// The playground's cheat sheet: short reminders, each with a snippet students can copy.

export type CheatItem = { code: string; note: string };
export type CheatSection = { title: string; items: CheatItem[] };
export type CheatTab = { id: string; label: string; sections: CheatSection[] };

export const CHEAT_SHEET: CheatTab[] = [
  {
    id: "python",
    label: "Python",
    sections: [
      {
        title: "Print and input",
        items: [
          { code: 'print("Hello!")', note: "Show text" },
          { code: 'print("Score:", score)', note: "Show text and a value" },
          { code: 'print(f"Hi {name}, you are {age}")', note: "f-string: put values inside text" },
          { code: 'name = input("Your name? ")', note: "Ask a question (gives text)" },
          { code: 'age = int(input("Your age? "))', note: "Ask for a whole number" },
        ],
      },
      {
        title: "Variables and maths",
        items: [
          { code: "x = 5\nx = x + 1   # or x += 1", note: "Store and change a value" },
          { code: "7 / 2    # 3.5\n7 // 2   # 3\n7 % 2    # 1 (remainder)\n2 ** 3   # 8 (power)", note: "Maths" },
          { code: 'str(5)  int("5")  float("2.5")', note: "Change type" },
          { code: "round(3.14159, 2)  abs(-4)  max(3, 9)", note: "Handy number functions" },
        ],
      },
      {
        title: "If, elif, else",
        items: [
          { code: 'if score >= 50:\n    print("Pass")\nelif score >= 40:\n    print("Close!")\nelse:\n    print("Try again")', note: "Make decisions" },
          { code: "==  !=  <  >  <=  >=\nand  or  not", note: "Compare and combine" },
        ],
      },
      {
        title: "Loops",
        items: [
          { code: "for i in range(5):\n    print(i)        # 0 to 4", note: "Repeat a set number of times" },
          { code: "for i in range(1, 11, 2):\n    print(i)        # 1, 3, 5, 7, 9", note: "range(start, stop, step)" },
          { code: "for fruit in fruits:\n    print(fruit)", note: "Go through a list" },
          { code: 'while answer != "yes":\n    answer = input("Ready? ")', note: "Repeat while something is true" },
          { code: "break      # leave the loop\ncontinue   # skip to the next turn", note: "Loop control" },
        ],
      },
      {
        title: "Lists",
        items: [
          { code: 'fruits = ["apple", "pear"]\nfruits.append("kiwi")\nfruits[0]     # "apple"\nfruits[-1]    # last one\nlen(fruits)   # 3', note: "Make and use a list" },
          { code: 'fruits.remove("pear")\n"apple" in fruits   # True\nsorted(fruits)', note: "Remove, check and sort" },
          { code: "squares = [n * n for n in range(5)]", note: "Build a list in one line" },
        ],
      },
      {
        title: "Dictionaries",
        items: [
          { code: 'ages = {"Sam": 12, "Mia": 11}\nages["Sam"]        # 12\nages["Leo"] = 13   # add or change', note: "Look things up by name" },
          { code: "for name, age in ages.items():\n    print(name, age)", note: "Go through a dictionary" },
        ],
      },
      {
        title: "Functions",
        items: [
          { code: 'def greet(name):\n    print("Hello", name)\n\ngreet("Ava")', note: "Make your own command" },
          { code: "def add(a, b):\n    return a + b\n\ntotal = add(2, 3)", note: "Give back a result" },
        ],
      },
      {
        title: "Text",
        items: [
          { code: 'word = "Python"\nword.upper()   word.lower()\nlen(word)      word[0]\nword[0:3]      # "Pyt"', note: "Work with text" },
          { code: '"a,b,c".split(",")\n" ".join(["a", "b"])\n"hi".replace("i", "ey")', note: "Split, join and replace" },
        ],
      },
      {
        title: "Random and time",
        items: [
          { code: "import random\nrandom.randint(1, 6)\nrandom.choice(fruits)\nrandom.shuffle(fruits)", note: "Random numbers and picks" },
          { code: "import time\ntime.sleep(1)   # wait 1 second", note: "Pause" },
        ],
      },
      {
        title: "Errors",
        items: [
          { code: 'try:\n    n = int(input("Number? "))\nexcept ValueError:\n    print("That\'s not a number")', note: "Catch a mistake instead of crashing" },
        ],
      },
    ],
  },
  {
    id: "turtle",
    label: "Turtle",
    sections: [
      {
        title: "Start",
        items: [
          { code: "import turtle\n\nt = turtle.Turtle()\n# ... your drawing ...\nturtle.done()", note: "Every turtle program" },
          { code: 'screen = turtle.Screen()\nscreen.bgcolor("black")\nscreen.title("My game")', note: "The window" },
        ],
      },
      {
        title: "Move",
        items: [
          { code: "t.forward(100)   t.backward(50)\nt.left(90)       t.right(45)", note: "Walk and turn" },
          { code: "t.goto(100, 50)\nt.setheading(90)   # 0 right, 90 up\nt.home()           # back to the middle", note: "Jump to a place" },
          { code: "t.xcor()  t.ycor()  t.pos()\nt.distance(other)", note: "Where is it?" },
          { code: "t.speed(0)   # 0 fastest, 1 slow, 10 fast", note: "Speed" },
        ],
      },
      {
        title: "Pen",
        items: [
          { code: "t.penup()     # move without drawing\nt.pendown()   # draw again", note: "Lift the pen" },
          { code: 't.pensize(5)\nt.color("red")\nt.color("red", "yellow")   # pen, fill', note: "Line size and colour" },
          { code: "t.hideturtle()   t.showturtle()\nt.clear()", note: "Hide the turtle, clear its drawing" },
        ],
      },
      {
        title: "Shapes",
        items: [
          { code: "for _ in range(4):\n    t.forward(100)\n    t.left(90)", note: "Square" },
          { code: "t.circle(50)\nt.circle(50, 180)   # half circle\nt.dot(20)", note: "Circles and dots" },
          { code: 't.begin_fill()\nt.circle(50)\nt.end_fill()', note: "Fill a shape" },
          { code: 't.write("Hi!", align="center", font=("Arial", 20, "bold"))', note: "Write text" },
          { code: 't.shape("turtle")   # arrow, circle, square, triangle\nt.shapesize(2)', note: "Turtle shape and size" },
        ],
      },
      {
        title: "Keys and clicks",
        items: [
          { code: 'def jump():\n    t.forward(20)\n\nscreen.onkey(jump, "space")\nscreen.listen()', note: "Run a function on a key" },
          { code: '"Up" "Down" "Left" "Right"\n"space" "Return" "a" "w"', note: "Key names" },
          { code: "screen.onscreenclick(t.goto)", note: "Click anywhere" },
          { code: "def hit(x, y):\n    print(\"Got me!\")\n\nt.onclick(hit)", note: "Click on a turtle" },
        ],
      },
      {
        title: "Games",
        items: [
          { code: "def tick():\n    t.forward(5)\n    screen.ontimer(tick, 50)   # again in 50 ms\n\ntick()", note: "Do something over and over" },
          { code: "screen.tracer(0)\nwhile True:\n    # move things...\n    screen.update()", note: "Fast game loop" },
          { code: "if t.distance(food) < 20:\n    print(\"Yum\")", note: "Did they touch?" },
        ],
      },
    ],
  },
];
