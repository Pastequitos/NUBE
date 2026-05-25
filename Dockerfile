FROM golang:1.23-alpine AS builder                                              

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o forum-server ./backend/main.go

FROM alpine:latest                                                                  
RUN apk add --no-cache ca-certificates sqlite

WORKDIR /root/

COPY --from=builder /app/forum-server .

COPY --from=builder /app/frontend ./frontend

EXPOSE 8080

CMD ["./forum-server"]
