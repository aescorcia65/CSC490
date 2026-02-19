"""
Business logic layer (services).

  - Routers call services; services do not import routers
  - Keeps endpoints thin and logic testable
  - Later: services can use database sessions, external APIs, etc.
"""
