package main

import (
 "os"
 "evolution.local/companion/internal/companion"
)

func main() { os.Exit(companion.Run(os.Args[1:],os.Args[0],os.Stdout,os.Stderr)) }