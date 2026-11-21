// Starter programs for the Python playground. They're plain desktop Python,
// so they run the same in VS Code or IDLE.

export type PyExample = { id: string; name: string; icon: string; blurb: string; group: "Basics" | "Turtle drawing" | "Turtle games"; code: string };

export const PY_EXAMPLES: PyExample[] = [
  {
    id: "hello",
    icon: "👋",
    blurb: "Print text and ask a question",
    name: "Hello and input()",
    group: "Basics",
    code: `# Press Run (or Ctrl/Cmd + Enter)
name = input("What's your name? ")
for i in range(1, 4):
    print(f"Hello {name}, this is line {i}")

squares = [n * n for n in range(6)]
print("Squares:", squares)
`,
  },
  {
    id: "guess",
    icon: "🔢",
    blurb: "Loops, if/else and random numbers",
    name: "Guess the number",
    group: "Basics",
    code: `import random

secret = random.randint(1, 100)
tries = 0
print("I'm thinking of a number from 1 to 100.")

while True:
    guess = int(input("Your guess: "))
    tries += 1
    if guess < secret:
        print("Higher!")
    elif guess > secret:
        print("Lower!")
    else:
        print(f"You got it in {tries} tries!")
        break
`,
  },
  {
    id: "spiral",
    icon: "🌀",
    blurb: "A colourful pattern with a for loop",
    name: "Rainbow spiral",
    group: "Turtle drawing",
    code: `import turtle

turtle.bgcolor("black")
t = turtle.Turtle()
t.speed(0)
t.pensize(2)

colours = ["red", "orange", "yellow", "green", "cyan", "purple"]
for i in range(120):
    t.pencolor(colours[i % len(colours)])
    t.forward(i * 3)
    t.left(59)

turtle.done()
`,
  },
  {
    id: "star",
    icon: "⭐",
    blurb: "Fill a shape with colour",
    name: "Filled star",
    group: "Turtle drawing",
    code: `import turtle

t = turtle.Turtle()
t.color("gold", "orange")
t.pensize(3)

t.begin_fill()
for _ in range(5):
    t.forward(200)
    t.right(144)
t.end_fill()

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "flower",
    icon: "🌸",
    blurb: "Repeat circles to make a flower",
    name: "Circle flower",
    group: "Turtle drawing",
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
colours = ["red", "magenta", "blue", "cyan", "green", "orange"]

for i in range(36):
    t.color(colours[i % len(colours)])
    t.circle(100)
    t.left(10)

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "keys",
    icon: "⌨️",
    blurb: "Move the turtle with the arrow keys",
    name: "Draw with arrow keys",
    group: "Turtle games",
    code: `import turtle

screen = turtle.Screen()
t = turtle.Turtle()
t.shape("turtle")
t.pensize(3)

def up():
    t.setheading(90)
    t.forward(10)

def down():
    t.setheading(270)
    t.forward(10)

def left():
    t.setheading(180)
    t.forward(10)

def right():
    t.setheading(0)
    t.forward(10)

screen.onkeypress(up, "Up")
screen.onkeypress(down, "Down")
screen.onkeypress(left, "Left")
screen.onkeypress(right, "Right")
screen.onkey(t.clear, "c")  # press c to clear
screen.listen()
turtle.done()
`,
  },
  {
    id: "click",
    icon: "🖱️",
    blurb: "Click anywhere to draw lines",
    name: "Click to draw",
    group: "Turtle games",
    code: `import turtle
import random

screen = turtle.Screen()
t = turtle.Turtle()
t.pensize(4)

def new_colour():
    t.color(random.choice(["red", "blue", "green", "purple", "orange"]))

screen.onscreenclick(t.goto)   # click anywhere to draw a line there
screen.onkey(new_colour, "space")
screen.onkey(t.clear, "c")
screen.listen()
turtle.done()
`,
  },
  {
    id: "catch",
    icon: "🐢",
    blurb: "Click the turtle before it hops away",
    name: "Catch the turtle",
    group: "Turtle games",
    code: `import turtle
import random

screen = turtle.Screen()
screen.bgcolor("lightblue")

t = turtle.Turtle()
t.shape("turtle")
t.color("green")
t.shapesize(2)
t.speed(0)
t.penup()

pen = turtle.Turtle()
pen.hideturtle()
pen.penup()
pen.goto(0, 200)
score = 0

def show_score():
    pen.clear()
    pen.write(f"Score: {score}", align="center", font=("Arial", 20, "bold"))

def caught(x, y):
    global score
    score += 1
    show_score()

def hop():
    t.goto(random.randint(-250, 250), random.randint(-180, 180))
    screen.ontimer(hop, max(300, 1000 - score * 50))  # faster as you score

t.onclick(caught)
show_score()
hop()
turtle.done()
`,
  },
  {
    id: "pong",
    icon: "🏓",
    blurb: "Two players: W/S and Up/Down",
    name: "Pong (2 players)",
    group: "Turtle games",
    code: `import turtle

screen = turtle.Screen()
screen.title("Pong")
screen.bgcolor("black")
screen.setup(800, 600)
screen.tracer(0)

def make_paddle(x):
    p = turtle.Turtle()
    p.shape("square")
    p.color("white")
    p.shapesize(stretch_wid=5, stretch_len=1)
    p.penup()
    p.goto(x, 0)
    return p

left = make_paddle(-350)
right = make_paddle(350)

ball = turtle.Turtle()
ball.shape("circle")
ball.color("white")
ball.penup()
dx, dy = 4, 4

pen = turtle.Turtle()
pen.hideturtle()
pen.penup()
pen.color("white")
pen.goto(0, 250)
score = [0, 0]

def show_score():
    pen.clear()
    pen.write(f"{score[0]}   {score[1]}", align="center", font=("Courier", 24, "normal"))

def move(paddle, step):
    y = paddle.ycor() + step
    if -250 < y < 250:
        paddle.sety(y)

# Left player: w and s. Right player: Up and Down.
screen.onkeypress(lambda: move(left, 25), "w")
screen.onkeypress(lambda: move(left, -25), "s")
screen.onkeypress(lambda: move(right, 25), "Up")
screen.onkeypress(lambda: move(right, -25), "Down")
screen.listen()
show_score()

while True:
    screen.update()
    ball.goto(ball.xcor() + dx, ball.ycor() + dy)

    if abs(ball.ycor()) > 290:
        dy = -dy
    if dx > 0 and 340 < ball.xcor() < 360 and abs(ball.ycor() - right.ycor()) < 55:
        dx = -dx
    if dx < 0 and -360 < ball.xcor() < -340 and abs(ball.ycor() - left.ycor()) < 55:
        dx = -dx
    if abs(ball.xcor()) > 390:
        score[0 if ball.xcor() > 0 else 1] += 1
        show_score()
        ball.goto(0, 0)
        dx = -dx
`,
  },
  {
    id: "snake",
    icon: "🐍",
    blurb: "Eat the food and grow",
    name: "Snake",
    group: "Turtle games",
    code: `import turtle
import random

screen = turtle.Screen()
screen.title("Snake")
screen.bgcolor("darkgreen")
screen.setup(600, 600)
screen.tracer(0)

head = turtle.Turtle()
head.shape("square")
head.color("yellow")
head.penup()

food = turtle.Turtle()
food.shape("circle")
food.color("red")
food.penup()
food.goto(0, 100)

pen = turtle.Turtle()
pen.hideturtle()
pen.penup()
pen.color("white")
pen.goto(0, 260)

body = []
direction = "stop"
score = 0

def show_score(text=""):
    pen.clear()
    pen.write(f"Score: {score}  {text}", align="center", font=("Arial", 18, "bold"))

def go(new):
    global direction
    opposite = {"up": "down", "down": "up", "left": "right", "right": "left"}
    if direction != opposite[new]:
        direction = new

screen.onkey(lambda: go("up"), "Up")
screen.onkey(lambda: go("down"), "Down")
screen.onkey(lambda: go("left"), "Left")
screen.onkey(lambda: go("right"), "Right")
screen.listen()

def step():
    global score
    if direction != "stop":
        tail = body[-1].pos() if body else head.pos()
        for i in range(len(body) - 1, 0, -1):
            body[i].goto(body[i - 1].pos())
        if body:
            body[0].goto(head.pos())

        x, y = head.pos()
        moves = {"up": (0, 20), "down": (0, -20), "left": (-20, 0), "right": (20, 0)}
        head.goto(x + moves[direction][0], y + moves[direction][1])

        if abs(head.xcor()) > 290 or abs(head.ycor()) > 290 or any(head.distance(b) < 10 for b in body):
            show_score("Game over!")
            screen.update()
            return

        if head.distance(food) < 15:
            food.goto(random.randint(-13, 13) * 20, random.randint(-13, 13) * 20)
            part = turtle.Turtle()
            part.shape("square")
            part.color("gold")
            part.penup()
            part.goto(tail)
            body.append(part)
            score += 1
            show_score()

    screen.update()
    screen.ontimer(step, 120)

show_score("Use the arrow keys")
step()
turtle.done()
`,
  },
];
